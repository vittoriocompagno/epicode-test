import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Redis } from 'ioredis';

const rateLimitPlugin: FastifyPluginAsync<{ redisUrl: string }> = async (app, options) => {
  const redis = new Redis(options.redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await app.register(rateLimit, {
      global: false,
      redis,
      nameSpace: 'certificates-api-rate-limit-',
    });
    app.addHook('onClose', async () => {
      await redis.quit();
    });
  } catch (error) {
    app.log.warn({ err: error }, 'Redis unavailable for rate limiting; falling back to memory store');
    redis.disconnect();
    await app.register(rateLimit, { global: false });
  }
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
});
