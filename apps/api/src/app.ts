import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Env } from './env.js';
import apiKeyPlugin from './plugins/api-key.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import healthRoutes from './routes/health.js';

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    bodyLimit: env.BODY_LIMIT_BYTES,
  });

  await app.register(errorHandlerPlugin);
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  await app.register(apiKeyPlugin, { apiKey: env.API_KEY });
  await app.register(healthRoutes);

  return app;
}
