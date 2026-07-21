import {
  CreateBatchSchema,
  type BatchAccepted,
  type BatchStatusResponse,
  type CreateBatchInput,
} from '@certificates/contracts';
import {
  batchItems,
  generationBatches,
  type Database,
} from '@certificates/database';
import { getByPath } from '@certificates/rendering';
import {
  enqueueBatchDispatch,
  type BatchDispatchQueue,
} from '@certificates/queue';
import { count, eq } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { DocumentRepository } from '../repositories/documents.js';
import { TemplateRepository } from '../repositories/templates.js';

export class BatchService {
  private readonly documents: DocumentRepository;
  private readonly templates: TemplateRepository;

  constructor(
    private readonly db: Database,
    private readonly batchDispatchQueue: BatchDispatchQueue,
  ) {
    this.documents = new DocumentRepository(db);
    this.templates = new TemplateRepository(db);
  }

  async create(input: CreateBatchInput): Promise<BatchAccepted> {
    const parsed = CreateBatchSchema.parse(input);
    const template = await this.templates.findById(parsed.templateId);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }

    const itemErrors: Array<{ index: number; missing: string[] }> = [];
    for (const [index, item] of parsed.items.entries()) {
      const missing = template.variables.filter(
        (path) => getByPath(item.variables, path) === undefined,
      );
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

    const [batch] = await this.db
      .insert(generationBatches)
      .values({
        templateId: parsed.templateId,
        status: 'queued',
        totalCount: parsed.items.length,
        emailTo: parsed.emailTo ?? null,
      })
      .returning();

    if (!batch) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create batch');
    }

    const createdDocuments = await this.documents.createMany(
      parsed.items.map((item) => ({
        templateId: parsed.templateId,
        variables: item.variables,
        emailTo: item.emailTo ?? parsed.emailTo ?? null,
      })),
    );

    const chunkSize = 500;
    for (let offset = 0; offset < createdDocuments.length; offset += chunkSize) {
      const slice = createdDocuments.slice(offset, offset + chunkSize);
      await this.db.insert(batchItems).values(
        slice.map((document) => ({
          batchId: batch.id,
          documentId: document.id,
          status: 'pending' as const,
        })),
      );
    }

    await enqueueBatchDispatch(this.batchDispatchQueue, batch.id);

    return {
      batchId: batch.id,
      status: 'queued',
      total: batch.totalCount,
    };
  }

  async get(batchId: string): Promise<BatchStatusResponse> {
    const [batch] = await this.db
      .select()
      .from(generationBatches)
      .where(eq(generationBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new AppError(404, 'BATCH_NOT_FOUND', 'Batch not found');
    }

    const counts = await this.db
      .select({
        status: batchItems.status,
        value: count(),
      })
      .from(batchItems)
      .where(eq(batchItems.batchId, batchId))
      .groupBy(batchItems.status);

    const byStatus = Object.fromEntries(counts.map((row) => [row.status, Number(row.value)])) as Record<
      string,
      number
    >;

    return {
      id: batch.id,
      status: batch.status,
      total: batch.totalCount,
      pending: byStatus.pending ?? 0,
      queued: byStatus.queued ?? 0,
      processing: byStatus.processing ?? 0,
      completed: byStatus.completed ?? 0,
      failed: byStatus.failed ?? 0,
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    };
  }
}
