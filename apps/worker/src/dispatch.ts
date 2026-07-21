import {
  batchItems,
  documents,
  markDocumentsQueued,
  persistDerivedBatchStatus,
  type Database,
} from '@certificates/database';
import {
  certificateJobId,
  createCertificateQueue,
  type CertificateQueue,
} from '@certificates/queue';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Logger } from 'pino';

/**
 * Dispatch pending (draft) batch documents.
 * Order: enqueue jobs first, then mark documents queued — so a crash after Redis
 * still leaves runnable jobs; a crash before Redis leaves drafts for restart.
 */
export async function dispatchBatch(
  batchId: string,
  deps: {
    db: Database;
    certificateQueue: CertificateQueue;
    chunkSize: number;
    logger: Logger;
  },
): Promise<void> {
  deps.logger.info({ batchId }, 'batch dispatch started');

  let dispatched = 0;

  for (;;) {
    const pending = await deps.db
      .select({
        itemId: batchItems.id,
        documentId: batchItems.documentId,
      })
      .from(batchItems)
      .innerJoin(documents, eq(documents.id, batchItems.documentId))
      .where(and(eq(batchItems.batchId, batchId), eq(documents.status, 'draft')))
      .orderBy(asc(batchItems.createdAt), asc(batchItems.id))
      .limit(deps.chunkSize);

    if (pending.length === 0) {
      break;
    }

    const jobs = pending.map((item) => ({
      name: 'generate-certificate' as const,
      data: { documentId: item.documentId },
      opts: {
        jobId: certificateJobId(item.documentId),
      },
    }));

    await deps.certificateQueue.addBulk(jobs);

    const documentIds = pending.map((item) => item.documentId);
    await markDocumentsQueued(deps.db, documentIds, ['draft']);

    // Keep batch_items.status loosely aligned for older rows; source of truth is documents.
    await deps.db
      .update(batchItems)
      .set({
        status: 'queued',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(batchItems.batchId, batchId),
          inArray(
            batchItems.id,
            pending.map((item) => item.itemId),
          ),
        ),
      );

    dispatched += pending.length;
    deps.logger.info(
      { batchId, chunkSize: pending.length, dispatched },
      'batch chunk dispatched',
    );
  }

  await persistDerivedBatchStatus(deps.db, batchId);
  deps.logger.info({ batchId, dispatched }, 'batch dispatch completed');
}

export { createCertificateQueue };
