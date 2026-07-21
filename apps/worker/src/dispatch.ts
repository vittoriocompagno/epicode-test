import { batchItems, documents, type Database } from '@certificates/database';
import {
  certificateJobId,
  createCertificateQueue,
  type CertificateQueue,
} from '@certificates/queue';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Logger } from 'pino';
import { refreshBatchStatus } from './generate.js';

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
      .select()
      .from(batchItems)
      .where(and(eq(batchItems.batchId, batchId), eq(batchItems.status, 'pending')))
      .orderBy(asc(batchItems.createdAt), asc(batchItems.id))
      .limit(deps.chunkSize);

    if (pending.length === 0) {
      break;
    }

    const documentIds = pending.map((item) => item.documentId);

    await deps.db
      .update(documents)
      .set({
        status: 'queued',
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(inArray(documents.id, documentIds), inArray(documents.status, ['draft', 'failed'])),
      );

    const jobs = pending.map((item) => ({
      name: 'generate-certificate' as const,
      data: { documentId: item.documentId },
      opts: {
        jobId: certificateJobId(item.documentId),
      },
    }));

    await deps.certificateQueue.addBulk(jobs);

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
            pending.map((item) => item.id),
          ),
        ),
      );

    dispatched += pending.length;
    deps.logger.info(
      { batchId, chunkSize: pending.length, dispatched },
      'batch chunk dispatched',
    );
  }

  await refreshBatchStatus(deps.db, batchId);
  deps.logger.info({ batchId, dispatched }, 'batch dispatch completed');
}

export function createWorkerCertificateQueue(redisUrl: string): CertificateQueue {
  return createCertificateQueue(redisUrl);
}
