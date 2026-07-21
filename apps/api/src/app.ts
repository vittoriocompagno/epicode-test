import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Env } from './env.js';
import apiKeyPlugin from './plugins/api-key.js';
import databasePlugin from './plugins/database.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import queuePlugin from './plugins/queue.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import storagePlugin from './plugins/storage.js';
import batchRoutes from './routes/batches.js';
import documentRoutes from './routes/documents.js';
import healthRoutes from './routes/health.js';
import templateRoutes from './routes/templates.js';

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'error' : env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    bodyLimit: env.BODY_LIMIT_BYTES,
  });

  await app.register(errorHandlerPlugin);
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  await app.register(databasePlugin, { databaseUrl: env.DATABASE_URL });
  await app.register(storagePlugin, { rootDir: env.LOCAL_STORAGE_PATH });
  await app.register(queuePlugin, { redisUrl: env.REDIS_URL });
  await app.register(apiKeyPlugin, { apiKey: env.API_KEY });
  await app.register(rateLimitPlugin, { redisUrl: env.REDIS_URL });
  await app.register(healthRoutes);
  await app.register(templateRoutes, { env });
  await app.register(documentRoutes, { env });
  await app.register(batchRoutes, { env });

  return app;
}
