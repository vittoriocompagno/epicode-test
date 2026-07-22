import type {
  BatchAccepted,
  BatchListQuery,
  BatchStatusResponse,
  CreateBatchInput,
  PaginatedBatches,
} from '@certificates/contracts';
import {
  batchItems,
  documents,
  generationBatches,
  summarizeBatch,
  summarizeBatches,
  deriveBatchStatus,
  type Database,
} from '@certificates/database';
import { findMissingVariables } from '@certificates/rendering';
import {
  enqueueBatchDispatch,
  type BatchDispatchQueue,
} from '@certificates/queue';
import { count, desc } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { TemplateRepository } from '../repositories/templates.js';

export class BatchService {
  private readonly templates: TemplateRepository;

  constructor(
    private readonly db: Database,
    private readonly batchDispatchQueue: BatchDispatchQueue,
  ) {
    this.templates = new TemplateRepository(db);
  }

  async create(input: CreateBatchInput, correlationId: string): Promise<BatchAccepted> {
    const template = await this.templates.findById(input.templateId);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }

    const itemErrors: Array<{ index: number; missing: string[] }> = [];
    for (const [index, item] of input.items.entries()) {
      const missing = findMissingVariables(template.variables, item.variables);
      if (missing.length > 0) {
        itemErrors.push({ index, missing });
      }
    }

    if (itemErrors.length > 0) {
      throw new AppError(422, 'BATCH_VALIDATION_FAILED', 'One or more batch items are invalid', {
        items: itemErrors.slice(0, 50),
        totalInvalid: itemErrors.length,
      });
    }

    const batchId = await this.db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(generationBatches)
        .values({
          templateId: input.templateId,
          status: 'queued',
          totalCount: input.items.length,
          emailTo: input.emailTo ?? null,
        })
        .returning();

      if (!batch) {
        throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create batch');
      }

      const createdDocuments = await tx
        .insert(documents)
        .values(
          input.items.map((item) => ({
            templateId: input.templateId,
            variables: item.variables,
            status: 'draft' as const,
            emailTo: item.emailTo ?? input.emailTo ?? null,
            emailStatus: (item.emailTo ?? input.emailTo)
              ? ('pending' as const)
              : ('skipped' as const),
          })),
        )
        .returning();

      const chunkSize = 500;
      for (let offset = 0; offset < createdDocuments.length; offset += chunkSize) {
        const slice = createdDocuments.slice(offset, offset + chunkSize);
        await tx.insert(batchItems).values(
          slice.map((document) => ({
            batchId: batch.id,
            documentId: document.id,
            status: 'pending' as const,
          })),
        );
      }

      return batch.id;
    });

    try {
      await enqueueBatchDispatch(this.batchDispatchQueue, { batchId, correlationId });
    } catch (error) {
      throw new AppError(
        503,
        'QUEUE_UNAVAILABLE',
        'Batch was persisted but dispatch could not be enqueued',
        { batchId, cause: error instanceof Error ? error.message : 'unknown' },
      );
    }

    return {
      batchId,
      status: 'queued',
      total: input.items.length,
    };
  }

  async list(query: BatchListQuery): Promise<PaginatedBatches> {
    const offset = (query.page - 1) * query.pageSize;
    const [totalRow] = await this.db.select({ value: count() }).from(generationBatches);
    const total = Number(totalRow?.value ?? 0);

    const rows = await this.db
      .select()
      .from(generationBatches)
      .orderBy(desc(generationBatches.createdAt))
      .limit(query.pageSize)
      .offset(offset);

    const countsByBatch = await summarizeBatches(
      this.db,
      rows.map((row) => row.id),
    );

    const items: BatchStatusResponse[] = rows.map((batch) => {
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
    });

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async get(batchId: string): Promise<BatchStatusResponse> {
    const progress = await summarizeBatch(this.db, batchId);
    if (!progress) {
      throw new AppError(404, 'BATCH_NOT_FOUND', 'Batch not found');
    }

    return {
      id: progress.id,
      status: progress.status,
      total: progress.total,
      pending: progress.pending,
      queued: progress.queued,
      processing: progress.processing,
      completed: progress.completed,
      failed: progress.failed,
      createdAt: progress.createdAt.toISOString(),
      completedAt: progress.completedAt ? progress.completedAt.toISOString() : null,
    };
  }
}
