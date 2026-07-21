import {
  CreateTemplateSchema,
  PreviewRequestSchema,
  TemplateListQuerySchema,
  UpdateTemplateSchema,
} from '@certificates/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../env.js';
import { parseUuidParam, parseWithSchema } from '../lib/validation.js';
import { TemplateService } from '../services/templates.js';

const templateRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const service = new TemplateService(app.db.db);

  app.get('/api/templates', async (request) => {
    const query = parseWithSchema(TemplateListQuerySchema, request.query);
    return service.list(query);
  });

  app.post(
    '/api/templates',
    {
      bodyLimit: opts.env.TEMPLATE_BODY_LIMIT_BYTES,
    },
    async (request, reply) => {
      const body = parseWithSchema(CreateTemplateSchema, request.body);
      const created = await service.create(body);
      return reply.code(201).send(created);
    },
  );

  app.get('/api/templates/:templateId', async (request) => {
    const templateId = parseUuidParam(request, 'templateId');
    return service.get(templateId);
  });

  app.patch(
    '/api/templates/:templateId',
    {
      bodyLimit: opts.env.TEMPLATE_BODY_LIMIT_BYTES,
    },
    async (request) => {
      const templateId = parseUuidParam(request, 'templateId');
      const body = parseWithSchema(UpdateTemplateSchema, request.body);
      return service.update(templateId, body);
    },
  );

  app.delete('/api/templates/:templateId', async (request, reply) => {
    const templateId = parseUuidParam(request, 'templateId');
    await service.delete(templateId);
    return reply.code(204).send();
  });

  app.post(
    '/api/templates/:templateId/preview',
    {
      bodyLimit: opts.env.PREVIEW_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: opts.env.PREVIEW_RATE_LIMIT_MAX,
          timeWindow: opts.env.PREVIEW_RATE_LIMIT_WINDOW_MS,
        },
      },
    },
    async (request) => {
      const templateId = parseUuidParam(request, 'templateId');
      const body = parseWithSchema(PreviewRequestSchema, request.body);
      return service.preview(templateId, body);
    },
  );
};

export default templateRoutes;
