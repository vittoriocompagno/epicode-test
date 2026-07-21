import type { OverviewResponse } from '@certificates/contracts';
import {
  documents,
  generationBatches,
  summarizeBatches,
  deriveBatchStatus,
  templates,
  type Database,
} from '@certificates/database';
import { count, desc } from 'drizzle-orm';

export class OverviewService {
  constructor(private readonly db: Database) {}

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

    const recentDocumentRows = await this.db
      .select()
      .from(documents)
      .orderBy(desc(documents.createdAt))
      .limit(8);

    const recentBatchRows = await this.db
      .select()
      .from(generationBatches)
      .orderBy(desc(generationBatches.createdAt))
      .limit(5);

    const countsByBatch = await summarizeBatches(
      this.db,
      recentBatchRows.map((row) => row.id),
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
      recentDocuments: recentDocumentRows.map((row) => ({
        id: row.id,
        templateId: row.templateId,
        variables: row.variables,
        status: row.status,
        outputPath: row.outputPath,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        attemptCount: row.attemptCount,
        emailTo: row.emailTo,
        emailStatus: row.emailStatus,
        emailError: row.emailError,
        emailedAt: row.emailedAt ? row.emailedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
      })),
      recentBatches: recentBatchRows.map((batch) => {
        const counts = countsByBatch.get(batch.id) ?? {
          pending: 0,
          queued: 0,
          processing: 0,
          completed: 0,
          failed: 0,
        };
        return {
          id: batch.id,
          status: deriveBatchStatus(counts, batch.totalCount),
          total: batch.totalCount,
          ...counts,
          createdAt: batch.createdAt.toISOString(),
          completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
        };
      }),
    };
  }
}
