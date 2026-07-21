import {
  batchItems,
  documents,
  generationBatches,
  templates,
  type Database,
} from '@certificates/database';
import { documentPdfStorageKey, type DocumentStorage } from '@certificates/storage';
import { renderTemplate, type PdfRenderer } from '@certificates/rendering';
import { and, count, eq, sql } from 'drizzle-orm';
import type { Transporter } from 'nodemailer';
import type { Logger } from 'pino';

export type GenerationDeps = {
  db: Database;
  storage: DocumentStorage;
  pdfRenderer: PdfRenderer;
  mailer: Transporter | null;
  mailFrom: string;
  logger: Logger;
};

export async function generateCertificateDocument(
  documentId: string,
  deps: GenerationDeps,
  attempt: number,
  maxAttempts = 3,
): Promise<void> {
  const started = Date.now();
  deps.logger.info({ documentId, attempt }, 'job started');

  const [document] = await deps.db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  if (document.status === 'completed') {
    deps.logger.info({ documentId }, 'document already completed; no-op');
    return;
  }

  const claimed = await claimProcessing(deps.db, documentId);
  if (!claimed) {
    const [latest] = await deps.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (latest?.status === 'completed') {
      deps.logger.info({ documentId }, 'lost claim because document completed');
      return;
    }

    throw new Error(`Unable to claim document ${documentId} for processing`);
  }

  await syncBatchItemStatus(deps.db, documentId, 'processing');

  try {
    const [template] = await deps.db
      .select()
      .from(templates)
      .where(eq(templates.id, claimed.templateId))
      .limit(1);

    if (!template) {
      throw new Error('Template not found');
    }

    const rendered = renderTemplate(template.html, claimed.variables);
    if (!rendered.ok) {
      throw new Error(rendered.message);
    }

    const pdf = await deps.pdfRenderer.render(rendered.html);
    if (pdf.subarray(0, 4).toString('utf8') !== '%PDF') {
      throw new Error('Renderer returned an invalid PDF');
    }

    const storageKey = documentPdfStorageKey(documentId);
    await deps.storage.put({
      key: storageKey,
      body: pdf,
      contentType: 'application/pdf',
    });

    await deps.db
      .update(documents)
      .set({
        status: 'completed',
        outputPath: storageKey,
        errorCode: null,
        errorMessage: null,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), eq(documents.status, 'processing')));

    await syncBatchItemStatus(deps.db, documentId, 'completed');
    await maybeRefreshBatch(deps.db, documentId);

    if (claimed.emailTo && deps.mailer) {
      try {
        await deps.mailer.sendMail({
          from: deps.mailFrom,
          to: claimed.emailTo,
          subject: 'Your certificate is ready',
          text: 'Please find your certificate attached.',
          attachments: [
            {
              filename: `certificate-${documentId}.pdf`,
              content: pdf,
              contentType: 'application/pdf',
            },
          ],
        });
        await deps.db
          .update(documents)
          .set({
            emailStatus: 'sent',
            emailError: null,
            emailedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Email delivery failed';
        deps.logger.error({ err: error, documentId }, 'email delivery failed');
        await deps.db
          .update(documents)
          .set({
            emailStatus: 'failed',
            emailError: message.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
      }
    }

    deps.logger.info(
      { documentId, attempt, durationMs: Date.now() - started },
      'job completed',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    deps.logger.error({ err: error, documentId, attempt, maxAttempts }, 'job failed');

    const isFinalAttempt = attempt >= maxAttempts;
    if (isFinalAttempt) {
      await deps.db
        .update(documents)
        .set({
          status: 'failed',
          errorCode: 'GENERATION_FAILED',
          errorMessage: message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      await syncBatchItemStatus(deps.db, documentId, 'failed');
      await maybeRefreshBatch(deps.db, documentId);
    } else {
      // Return to queued so the next BullMQ attempt can reclaim atomically.
      await deps.db
        .update(documents)
        .set({
          status: 'queued',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
      await syncBatchItemStatus(deps.db, documentId, 'queued');
    }

    throw error;
  }
}

async function claimProcessing(db: Database, documentId: string) {
  const [row] = await db
    .update(documents)
    .set({
      status: 'processing',
      attemptCount: sql`${documents.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.status, 'queued')))
    .returning();

  return row ?? null;
}

async function syncBatchItemStatus(
  db: Database,
  documentId: string,
  status: 'queued' | 'processing' | 'completed' | 'failed',
): Promise<void> {
  await db
    .update(batchItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(batchItems.documentId, documentId));
}

async function maybeRefreshBatch(db: Database, documentId: string): Promise<void> {
  const [item] = await db
    .select()
    .from(batchItems)
    .where(eq(batchItems.documentId, documentId))
    .limit(1);

  if (!item) {
    return;
  }

  await refreshBatchStatus(db, item.batchId);
}

export async function refreshBatchStatus(db: Database, batchId: string): Promise<void> {
  const counts = await db
    .select({
      status: batchItems.status,
      value: count(),
    })
    .from(batchItems)
    .where(eq(batchItems.batchId, batchId))
    .groupBy(batchItems.status);

  const byStatus = Object.fromEntries(
    counts.map((row) => [row.status, Number(row.value)]),
  ) as Record<string, number>;

  const pending = byStatus.pending ?? 0;
  const queued = byStatus.queued ?? 0;
  const processing = byStatus.processing ?? 0;
  const completed = byStatus.completed ?? 0;
  const failed = byStatus.failed ?? 0;
  const total = pending + queued + processing + completed + failed;

  let status: 'queued' | 'processing' | 'completed' | 'failed' = 'queued';
  if (total > 0 && completed + failed === total) {
    status = failed === total ? 'failed' : 'completed';
  } else if (total > 0 && pending < total) {
    status = 'processing';
  }

  await db
    .update(generationBatches)
    .set({
      status,
      updatedAt: new Date(),
      completedAt: status === 'completed' || status === 'failed' ? new Date() : null,
    })
    .where(eq(generationBatches.id, batchId));
}
