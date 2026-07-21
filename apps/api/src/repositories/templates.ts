import type {
  CreateTemplateInput,
  TemplateListQuery,
  TemplateResponse,
  UpdateTemplateInput,
} from '@certificates/contracts';
import { documents, templates, type Database } from '@certificates/database';
import { count, desc, eq, ilike } from 'drizzle-orm';
import { AppError } from '../errors.js';

function toTemplateResponse(row: typeof templates.$inferSelect): TemplateResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    html: row.html,
    variables: row.variables,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class TemplateRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateTemplateInput & { variables: string[] }): Promise<TemplateResponse> {
    const [row] = await this.db
      .insert(templates)
      .values({
        name: input.name,
        description: input.description ?? null,
        html: input.html,
        variables: input.variables,
      })
      .returning();

    if (!row) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create template');
    }

    return toTemplateResponse(row);
  }

  async findById(id: string): Promise<TemplateResponse | null> {
    const [row] = await this.db.select().from(templates).where(eq(templates.id, id)).limit(1);
    return row ? toTemplateResponse(row) : null;
  }

  async list(query: TemplateListQuery): Promise<{
    items: TemplateResponse[];
    total: number;
  }> {
    const where = query.search ? ilike(templates.name, `%${query.search}%`) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const [totalRow] = await this.db.select({ value: count() }).from(templates).where(where);

    const rows = await this.db
      .select()
      .from(templates)
      .where(where)
      .orderBy(desc(templates.createdAt), desc(templates.id))
      .limit(query.pageSize)
      .offset(offset);

    return {
      items: rows.map(toTemplateResponse),
      total: Number(totalRow?.value ?? 0),
    };
  }

  async update(
    id: string,
    input: UpdateTemplateInput & { variables?: string[] },
  ): Promise<TemplateResponse | null> {
    const [row] = await this.db
      .update(templates)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.html !== undefined ? { html: input.html } : {}),
        ...(input.variables !== undefined ? { variables: input.variables } : {}),
        updatedAt: new Date(),
      })
      .where(eq(templates.id, id))
      .returning();

    return row ? toTemplateResponse(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(templates)
      .where(eq(templates.id, id))
      .returning({ id: templates.id });
    return deleted.length > 0;
  }

  async countDocuments(templateId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(documents)
      .where(eq(documents.templateId, templateId));
    return Number(row?.value ?? 0);
  }
}
