import type { OverviewResponse } from '@certificates/contracts';
import {
  batchItems,
  documents,
  generationBatches,
  templates,
  type Database,
} from '@certificates/database';
import { count, desc, eq, sql } from 'drizzle-orm';
import { DocumentRepository } from '../repositories/documents.js';

export class OverviewService {
  private readonly documents: DocumentRepository;

  constructor(private readonly db: Database) {
    this.documents = new DocumentRepository(db);
  }

  async get(): Promise<OverviewResponse> {
    const [templateCount] = await this.db.select({ value: count() }).from(templates);

    const statusCounts = await this.db
      .select({
        status: documents.status,
        value: count(),
      })
      .from(documents)
      .groupBy(documents.status);

    const byStatus = Object.fromEntries(
      statusCounts.map((row) => [row.status, Number(row.value)]),
    ) as Record<string, number>;

    const recentDocuments = await this.documents.list({ page: 1, pageSize: 8 });

    const recentBatchRows = await this.db
      .select()
      .from(generationBatches)
      .orderBy(desc(generationBatches.createdAt))
      .limit(5);

    const recentBatches = await Promise.all(
      recentBatchRows.map(async (batch) => {
        const itemCounts = await this.db
          .select({
            status: batchItems.status,
            value: count(),
          })
          .from(batchItems)
          .where(eq(batchItems.batchId, batch.id))
          .groupBy(batchItems.status);

        const itemsByStatus = Object.fromEntries(
          itemCounts.map((row) => [row.status, Number(row.value)]),
        ) as Record<string, number>;

        return {
          id: batch.id,
          status: batch.status,
          total: batch.totalCount,
          pending: itemsByStatus.pending ?? 0,
          queued: itemsByStatus.queued ?? 0,
          processing: itemsByStatus.processing ?? 0,
          completed: itemsByStatus.completed ?? 0,
          failed: itemsByStatus.failed ?? 0,
          createdAt: batch.createdAt.toISOString(),
          completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
        };
      }),
    );

    return {
      api: {
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString(),
      },
      templates: Number(templateCount?.value ?? 0),
      documentsByStatus: {
        draft: byStatus.draft ?? 0,
        queued: byStatus.queued ?? 0,
        processing: byStatus.processing ?? 0,
        completed: byStatus.completed ?? 0,
        failed: byStatus.failed ?? 0,
      },
      recentDocuments: recentDocuments.items,
      recentBatches,
    };
  }
}

// Keep drizzle `sql` import available for future aggregate tweaks without unused-import churn.
void sql;
