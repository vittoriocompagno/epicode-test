import {
  closeDatabaseClient,
  createDatabaseClient,
  type DatabaseClient,
} from '@certificates/database';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseClient;
  }
}

const databasePlugin: FastifyPluginAsync<{ databaseUrl: string }> = async (app, options) => {
  const client = createDatabaseClient(options.databaseUrl);
  app.decorate('db', client);

  app.addHook('onClose', async () => {
    await closeDatabaseClient(client);
  });
};

export default fp(databasePlugin, {
  name: 'database',
});
