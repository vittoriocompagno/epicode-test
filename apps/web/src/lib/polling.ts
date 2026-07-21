import type { OverviewResponse } from '@certificates/contracts';

export const POLL_ACTIVE_MS = 2000;

const ACTIVE_BATCH_STATUSES = new Set(['queued', 'processing']);

export function pollWhileActive(isActive: boolean): number | false {
  return isActive ? POLL_ACTIVE_MS : false;
}

export function hasActiveDocuments(overview?: OverviewResponse): boolean {
  if (!overview) return false;
  const { queued, processing } = overview.documentsByStatus;
  return queued + processing > 0;
}

export function hasActiveBatches(overview?: OverviewResponse): boolean {
  if (!overview) return false;
  return overview.recentBatches.some((batch) => ACTIVE_BATCH_STATUSES.has(batch.status));
}

export function hasActiveWork(overview?: OverviewResponse): boolean {
  return hasActiveDocuments(overview) || hasActiveBatches(overview);
}

export function hasActiveDocumentItems(
  items: Array<{ status: string }> | undefined,
): boolean {
  return items?.some((item) => item.status === 'queued' || item.status === 'processing') ?? false;
}

export function hasActiveBatchItems(
  items: Array<{ status: string }> | undefined,
): boolean {
  return items?.some((item) => ACTIVE_BATCH_STATUSES.has(item.status)) ?? false;
}
