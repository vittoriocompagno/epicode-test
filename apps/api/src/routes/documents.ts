import {
  CreateDocumentSchema,
  DocumentListQuerySchema,
  UpdateDocumentSchema,
} from '@certificates/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../env.js';
import { parseUuidParam, parseWithSchema } from '../lib/validation.js';
import { DocumentService } from '../services/documents.js';
import { GenerationService } from '../services/generation.js';

const documentRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const documents = new DocumentService(app.db.db);
  const generation = new GenerationService(
    app.db.db,
    app.certificateQueue,
    app.storage,
  );

  const generateRateLimit = {
    max: opts.env.GENERATE_RATE_LIMIT_MAX,
    timeWindow: opts.env.GENERATE_RATE_LIMIT_WINDOW_MS,
  };

  app.get('/api/documents', async (request) => {
    const query = parseWithSchema(DocumentListQuerySchema, request.query);
    return documents.list(query);
  });

  app.post('/api/documents', async (request, reply) => {
    const body = parseWithSchema(CreateDocumentSchema, request.body);
    const created = await documents.create(body);
    return reply.code(201).send(created);
  });

  app.get('/api/documents/:documentId', async (request) => {
    const documentId = parseUuidParam(request, 'documentId');
    return documents.get(documentId);
  });

  app.patch('/api/documents/:documentId', async (request) => {
    const documentId = parseUuidParam(request, 'documentId');
    const body = parseWithSchema(UpdateDocumentSchema, request.body);
    return documents.update(documentId, body);
  });

  app.delete('/api/documents/:documentId', async (request, reply) => {
    const documentId = parseUuidParam(request, 'documentId');
    await documents.delete(documentId);
    return reply.code(204).send();
  });

  app.post(
    '/api/documents/:documentId/generate',
    { config: { rateLimit: generateRateLimit } },
    async (request, reply) => {
      const documentId = parseUuidParam(request, 'documentId');
      const accepted = await generation.generate(documentId, request.id);
      request.log.info(
        { correlationId: request.id, documentId, jobId: accepted.jobId },
        'generation accepted',
      );
      return reply.code(202).send(accepted);
    },
  );

  app.post(
    '/api/documents/:documentId/retry',
    { config: { rateLimit: generateRateLimit } },
    async (request, reply) => {
      const documentId = parseUuidParam(request, 'documentId');
      const accepted = await generation.retry(documentId, request.id);
      request.log.info(
        { correlationId: request.id, documentId, jobId: accepted.jobId },
        'generation retry accepted',
      );
      return reply.code(202).send(accepted);
    },
  );

  app.get('/api/documents/:documentId/status', async (request) => {
    const documentId = parseUuidParam(request, 'documentId');
    return generation.status(documentId);
  });

  app.get('/api/documents/:documentId/download', async (request, reply) => {
    const documentId = parseUuidParam(request, 'documentId');
    const file = await generation.download(documentId);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.body);
  });
};

export default documentRoutes;
