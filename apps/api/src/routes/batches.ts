import { CreateBatchSchema } from '@certificates/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../env.js';
import { parseUuidParam, parseWithSchema } from '../lib/validation.js';
import { BatchService } from '../services/batches.js';

const batchRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const batches = new BatchService(app.db.db, app.batchDispatchQueue);

  app.post(
    '/api/batches',
    {
      bodyLimit: opts.env.BATCH_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: opts.env.BATCH_RATE_LIMIT_MAX,
          timeWindow: opts.env.BATCH_RATE_LIMIT_WINDOW_MS,
        },
      },
    },
    async (request, reply) => {
      const body = parseWithSchema(CreateBatchSchema, request.body);
      const accepted = await batches.create(body);
      return reply.code(202).send(accepted);
    },
  );

  app.get('/api/batches/:batchId', async (request) => {
    const batchId = parseUuidParam(request, 'batchId');
    return batches.get(batchId);
  });
};

export default batchRoutes;
