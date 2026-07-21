import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  createBatchDispatchQueue,
  createCertificateQueue,
  type BatchDispatchQueue,
  type CertificateQueue,
} from '@certificates/queue';

declare module 'fastify' {
  interface FastifyInstance {
    certificateQueue: CertificateQueue;
    batchDispatchQueue: BatchDispatchQueue;
  }
}

const queuePlugin: FastifyPluginAsync<{ redisUrl: string }> = async (app, options) => {
  const certificateQueue = createCertificateQueue(options.redisUrl);
  const batchDispatchQueue = createBatchDispatchQueue(options.redisUrl);

  app.decorate('certificateQueue', certificateQueue);
  app.decorate('batchDispatchQueue', batchDispatchQueue);

  app.addHook('onClose', async () => {
    await Promise.all([certificateQueue.close(), batchDispatchQueue.close()]);
  });
};

export default fp(queuePlugin, {
  name: 'queues',
});
