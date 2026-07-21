import type {
  CreateDocumentInput,
  DocumentListQuery,
  DocumentResponse,
  UpdateDocumentInput,
} from '@certificates/contracts';
import { documents, type Database } from '@certificates/database';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { AppError } from '../errors.js';

function toDocumentResponse(row: typeof documents.$inferSelect): DocumentResponse {
  return {
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
  };
}

export class DocumentRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateDocumentInput): Promise<DocumentResponse> {
    const [row] = await this.db
      .insert(documents)
      .values({
        templateId: input.templateId,
        variables: input.variables,
        status: 'draft',
        emailTo: input.emailTo ?? null,
        emailStatus: input.emailTo ? 'pending' : 'skipped',
      })
      .returning();

    if (!row) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create document');
    }

    return toDocumentResponse(row);
  }

  async createMany(
    values: Array<{
      templateId: string;
      variables: Record<string, unknown>;
      emailTo?: string | null;
    }>,
  ): Promise<DocumentResponse[]> {
    if (values.length === 0) {
      return [];
    }

    const rows = await this.db
      .insert(documents)
      .values(
        values.map((value) => ({
          templateId: value.templateId,
          variables: value.variables,
          status: 'draft' as const,
          emailTo: value.emailTo ?? null,
          emailStatus: value.emailTo ? ('pending' as const) : ('skipped' as const),
        })),
      )
      .returning();

    return rows.map(toDocumentResponse);
  }

  async findById(id: string): Promise<DocumentResponse | null> {
    const [row] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return row ? toDocumentResponse(row) : null;
  }

  async list(query: DocumentListQuery): Promise<{ items: DocumentResponse[]; total: number }> {
    const filters = [];
    if (query.templateId) {
      filters.push(eq(documents.templateId, query.templateId));
    }
    if (query.status) {
      filters.push(eq(documents.status, query.status));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const [totalRow] = await this.db.select({ value: count() }).from(documents).where(where);

    const rows = await this.db
      .select()
      .from(documents)
      .where(where)
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: rows.map(toDocumentResponse),
      total: Number(totalRow?.value ?? 0),
    };
  }

  async update(id: string, input: UpdateDocumentInput): Promise<DocumentResponse | null> {
    const [row] = await this.db
      .update(documents)
      .set({
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        ...(input.variables !== undefined ? { variables: input.variables } : {}),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();

    return row ? toDocumentResponse(row) : null;
  }

  async markQueued(id: string, fromStatuses: Array<DocumentResponse['status']>): Promise<DocumentResponse | null> {
    const [row] = await this.db
      .update(documents)
      .set({
        status: 'queued',
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, id), inArray(documents.status, fromStatuses)))
      .returning();

    return row ? toDocumentResponse(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning({ id: documents.id });
    return deleted.length > 0;
  }
}
