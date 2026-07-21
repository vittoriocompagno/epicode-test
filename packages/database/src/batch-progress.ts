import { count, eq, inArray } from 'drizzle-orm';
import type { Database } from './client.js';
import { batchItems, documents, generationBatches } from './schema.js';
import type { DocumentStatus } from './document-lifecycle.js';

export type BatchProgressCounts = {
  pending: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
};

export type BatchProgress = BatchProgressCounts & {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  total: number;
  createdAt: Date;
  completedAt: Date | null;
};

export function deriveBatchStatus(
  counts: BatchProgressCounts,
  total: number,
): BatchProgress['status'] {
  const finished = counts.completed + counts.failed;
  if (total > 0 && finished === total) {
    return counts.failed === total ? 'failed' : 'completed';
  }
  if (counts.queued + counts.processing + counts.completed + counts.failed > 0) {
    return 'processing';
  }
  return 'queued';
}

function emptyCounts(): BatchProgressCounts {
  return { pending: 0, queued: 0, processing: 0, completed: 0, failed: 0 };
}

export async function summarizeBatch(db: Database, batchId: string): Promise<BatchProgress | null> {
  const [batch] = await db
    .select()
    .from(generationBatches)
    .where(eq(generationBatches.id, batchId))
    .limit(1);

  if (!batch) {
    return null;
  }

  const rows = await db
    .select({
      status: documents.status,
      value: count(),
    })
    .from(batchItems)
    .innerJoin(documents, eq(documents.id, batchItems.documentId))
    .where(eq(batchItems.batchId, batchId))
    .groupBy(documents.status);

  const counts = emptyCounts();
  for (const row of rows) {
    const value = Number(row.value);
    if (row.status === 'draft') {
      counts.pending += value;
    } else if (row.status === 'queued') {
      counts.queued += value;
    } else if (row.status === 'processing') {
      counts.processing += value;
    } else if (row.status === 'completed') {
      counts.completed += value;
    } else if (row.status === 'failed') {
      counts.failed += value;
    }
  }

  const status = deriveBatchStatus(counts, batch.totalCount);
  return {
    id: batch.id,
    status,
    total: batch.totalCount,
    ...counts,
    createdAt: batch.createdAt,
    completedAt: batch.completedAt,
  };
}

export async function summarizeBatches(
  db: Database,
  batchIds: string[],
): Promise<Map<string, BatchProgressCounts>> {
  const result = new Map<string, BatchProgressCounts>();
  for (const id of batchIds) {
    result.set(id, emptyCounts());
  }
  if (batchIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      batchId: batchItems.batchId,
      status: documents.status,
      value: count(),
    })
    .from(batchItems)
    .innerJoin(documents, eq(documents.id, batchItems.documentId))
    .where(inArray(batchItems.batchId, batchIds))
    .groupBy(batchItems.batchId, documents.status);

  for (const row of rows) {
    const counts = result.get(row.batchId) ?? emptyCounts();
    const value = Number(row.value);
    const status = row.status as DocumentStatus;
    if (status === 'draft') counts.pending += value;
    else if (status === 'queued') counts.queued += value;
    else if (status === 'processing') counts.processing += value;
    else if (status === 'completed') counts.completed += value;
    else if (status === 'failed') counts.failed += value;
    result.set(row.batchId, counts);
  }

  return result;
}

export async function persistDerivedBatchStatus(db: Database, batchId: string): Promise<void> {
  const progress = await summarizeBatch(db, batchId);
  if (!progress) {
    return;
  }

  await db
    .update(generationBatches)
    .set({
      status: progress.status,
      updatedAt: new Date(),
      completedAt:
        progress.status === 'completed' || progress.status === 'failed' ? new Date() : null,
    })
    .where(eq(generationBatches.id, batchId));
}
