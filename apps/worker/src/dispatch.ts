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
import { and, asc, eq } from 'drizzle-orm';

export type BatchDispatchLogger = {
  info: (context: Record<string, unknown>, message: string) => void;
};

export async function dispatchBatch(
  batchId: string,
  deps: {
    db: Database;
    certificateQueue: CertificateQueue;
    chunkSize: number;
    logger: BatchDispatchLogger;
  },
): Promise<void> {
  deps.logger.info({ batchId }, 'batch dispatch started');

  let dispatched = 0;

  for (;;) {
    const pending = await deps.db
      .select({
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

    dispatched += pending.length;
    deps.logger.info({ batchId, chunkSize: pending.length, dispatched }, 'batch chunk dispatched');
  }

  await persistDerivedBatchStatus(deps.db, batchId);
  deps.logger.info({ batchId, dispatched }, 'batch dispatch completed');
}

export { createCertificateQueue };
