import {
  batchItems,
  claimDocumentForProcessing,
  documents,
  markDocumentCompleted,
  markDocumentFailed,
  persistDerivedBatchStatus,
  requeueDocumentAfterTransientFailure,
  templates,
  type Database,
} from '@certificates/database';
import { documentPdfStorageKey, type DocumentStorage } from '@certificates/storage';
import { renderTemplate, type PdfRenderer } from '@certificates/rendering';
import { eq } from 'drizzle-orm';
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
    await persistDerivedBatchStatusForDocument(deps.db, documentId);
    return;
  }

  const claimed = await claimDocumentForProcessing(deps.db, documentId);
  if (!claimed) {
    const [latest] = await deps.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (latest?.status === 'completed') {
      deps.logger.info({ documentId }, 'lost claim because document completed');
      await persistDerivedBatchStatusForDocument(deps.db, documentId);
      return;
    }

    throw new Error(`Unable to claim document ${documentId} for processing`);
  }

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

    const completed = await markDocumentCompleted(deps.db, documentId, storageKey);
    if (!completed) {
      await deps.storage.delete(storageKey);
      throw new Error(`Document ${documentId} was not in processing state when completing`);
    }

    await persistDerivedBatchStatusForDocument(deps.db, documentId);

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
      await markDocumentFailed(deps.db, documentId, {
        code: 'GENERATION_FAILED',
        message,
      });
      await persistDerivedBatchStatusForDocument(deps.db, documentId);
    } else {
      await requeueDocumentAfterTransientFailure(deps.db, documentId);
    }

    throw error;
  }
}

async function persistDerivedBatchStatusForDocument(db: Database, documentId: string): Promise<void> {
  const [item] = await db
    .select()
    .from(batchItems)
    .where(eq(batchItems.documentId, documentId))
    .limit(1);

  if (!item) {
    return;
  }

  await persistDerivedBatchStatus(db, item.batchId);
}
