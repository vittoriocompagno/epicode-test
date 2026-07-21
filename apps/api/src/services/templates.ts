import type {
  AdHocPreviewRequest,
  CreateTemplateInput,
  PaginatedTemplates,
  PreviewRequest,
  PreviewResponse,
  TemplateListQuery,
  TemplateResponse,
  UpdateTemplateInput,
} from '@certificates/contracts';
import type { Database } from '@certificates/database';
import { renderTemplate, validateTemplate } from '@certificates/rendering';
import { AppError } from '../errors.js';
import { TemplateRepository } from '../repositories/templates.js';

export class TemplateService {
  private readonly templates: TemplateRepository;

  constructor(db: Database) {
    this.templates = new TemplateRepository(db);
  }

  async create(input: CreateTemplateInput): Promise<TemplateResponse> {
    const variables = this.assertValidTemplate(input.html);
    return this.templates.create({ ...input, variables });
  }

  async get(id: string): Promise<TemplateResponse> {
    const template = await this.templates.findById(id);
    if (!template) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }
    return template;
  }

  async list(query: TemplateListQuery): Promise<PaginatedTemplates> {
    const { items, total } = await this.templates.list(query);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async update(id: string, input: UpdateTemplateInput): Promise<TemplateResponse> {
    await this.get(id);

    const patch: UpdateTemplateInput & { variables?: string[] } = { ...input };
    if (input.html !== undefined) {
      patch.variables = this.assertValidTemplate(input.html);
    }

    const updated = await this.templates.update(id, patch);
    if (!updated) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    const referenced = await this.templates.countDocuments(id);
    if (referenced > 0) {
      throw new AppError(
        409,
        'TEMPLATE_IN_USE',
        'Cannot delete a template that is referenced by documents',
        { documentCount: referenced },
      );
    }

    const deleted = await this.templates.delete(id);
    if (!deleted) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    }
  }

  async preview(id: string, input: PreviewRequest): Promise<PreviewResponse> {
    const template = await this.get(id);
    return this.renderPreview(template.html, input.variables, template.variables);
  }

  async previewAdHoc(input: AdHocPreviewRequest): Promise<PreviewResponse> {
    const variables = this.assertValidTemplate(input.html);
    return this.renderPreview(input.html, input.variables, variables);
  }

  private renderPreview(
    html: string,
    variables: Record<string, unknown>,
    detected: string[],
  ): PreviewResponse {
    const rendered = renderTemplate(html, variables);
    if (!rendered.ok) {
      if (rendered.code === 'MISSING_VARIABLES') {
        throw new AppError(422, 'MISSING_VARIABLES', rendered.message, rendered.details ?? {});
      }
      throw new AppError(400, 'INVALID_TEMPLATE', rendered.message, rendered.details ?? {});
    }

    return {
      html: rendered.html,
      variables: detected,
    };
  }

  private assertValidTemplate(html: string): string[] {
    const validation = validateTemplate(html);
    if (!validation.ok) {
      throw new AppError(400, 'INVALID_TEMPLATE', 'Template failed validation', {
        issues: validation.issues,
      });
    }
    return validation.variables;
  }
}
