import type {
  CreateDocumentInput,
  DocumentResponse,
  DocumentListQuery,
  PaginatedDocuments,
  UpdateDocumentInput,
} from '@certificates/contracts';
import type { Database } from '@certificates/database';
import { getByPath } from '@certificates/rendering';
import { AppError } from '../errors.js';
import { DocumentRepository } from '../repositories/documents.js';
import { TemplateRepository } from '../repositories/templates.js';

const DELETABLE_STATUSES = new Set(['draft', 'completed', 'failed']);

export class DocumentService {
  private readonly documents: DocumentRepository;
  private readonly templates: TemplateRepository;

  constructor(db: Database) {
    this.documents = new DocumentRepository(db);
    this.templates = new TemplateRepository(db);
  }

  async create(input: CreateDocumentInput): Promise<DocumentResponse> {
    const template = await this.templates.findById(input.templateId);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }

    this.assertVariablesPresent(template.variables, input.variables);
    return this.documents.create(input);
  }

  async get(id: string): Promise<DocumentResponse> {
    const document = await this.documents.findById(id);
    if (!document) {
      throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }
    return document;
  }

  async list(query: DocumentListQuery): Promise<PaginatedDocuments> {
    const { items, total } = await this.documents.list(query);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async update(id: string, input: UpdateDocumentInput): Promise<DocumentResponse> {
    const existing = await this.get(id);
    if (existing.status !== 'draft') {
      throw new AppError(
        409,
        'DOCUMENT_NOT_EDITABLE',
        'Only draft documents can be updated',
        { status: existing.status },
      );
    }

    const templateId = input.templateId ?? existing.templateId;
    const variables = input.variables ?? existing.variables;
    const template = await this.templates.findById(templateId);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }

    this.assertVariablesPresent(template.variables, variables);

    const updated = await this.documents.update(id, {
      templateId,
      variables,
    });
    if (!updated) {
      throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!DELETABLE_STATUSES.has(existing.status)) {
      throw new AppError(
        409,
        'DOCUMENT_NOT_DELETABLE',
        'Documents in queued or processing state cannot be deleted',
        { status: existing.status },
      );
    }

    const deleted = await this.documents.delete(id);
    if (!deleted) {
      throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    }
  }

  private assertVariablesPresent(
    required: string[],
    variables: Record<string, unknown>,
  ): void {
    const missing = required.filter((path) => getByPath(variables, path) === undefined);
    if (missing.length > 0) {
      throw new AppError(422, 'MISSING_VARIABLES', 'Document is missing required variables', {
        missing,
      });
    }
  }
}
