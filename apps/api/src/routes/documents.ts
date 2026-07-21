import {
  CreateDocumentSchema,
  DocumentListQuerySchema,
  UpdateDocumentSchema,
} from '@certificates/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { parseUuidParam, parseWithSchema } from '../lib/validation.js';
import { DocumentService } from '../services/documents.js';

const documentRoutes: FastifyPluginAsync = async (app) => {
  const service = new DocumentService(app.db.db);

  app.get('/api/documents', async (request) => {
    const query = parseWithSchema(DocumentListQuerySchema, request.query);
    return service.list(query);
  });

  app.post('/api/documents', async (request, reply) => {
    const body = parseWithSchema(CreateDocumentSchema, request.body);
    const created = await service.create(body);
    return reply.code(201).send(created);
  });

  app.get('/api/documents/:documentId', async (request) => {
    const documentId = parseUuidParam(request, 'documentId');
    return service.get(documentId);
  });

  app.patch('/api/documents/:documentId', async (request) => {
    const documentId = parseUuidParam(request, 'documentId');
    const body = parseWithSchema(UpdateDocumentSchema, request.body);
    return service.update(documentId, body);
  });

  app.delete('/api/documents/:documentId', async (request, reply) => {
    const documentId = parseUuidParam(request, 'documentId');
    await service.delete(documentId);
    return reply.code(204).send();
  });
};

export default documentRoutes;
