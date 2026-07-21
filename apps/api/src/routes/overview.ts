import type { FastifyPluginAsync } from 'fastify';
import { OverviewService } from '../services/overview.js';

const overviewRoutes: FastifyPluginAsync = async (app) => {
  const overview = new OverviewService(app.db.db);

  app.get('/api/overview', async () => overview.get());
};

export default overviewRoutes;
