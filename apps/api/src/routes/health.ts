import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@certificates/contracts';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoutes;
