import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../errors.js';

function safeEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

const apiKeyPlugin: FastifyPluginAsync<{ apiKey: string }> = async (app, options) => {
  app.addHook('onRequest', async (request) => {
    const header = request.headers['x-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !safeEqual(provided, options.apiKey)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Valid X-API-Key header is required');
    }
  });
};

export default fp(apiKeyPlugin, {
  name: 'api-key-auth',
});
