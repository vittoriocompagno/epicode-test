import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { LocalFilesystemStorage, type DocumentStorage } from '@certificates/storage';

declare module 'fastify' {
  interface FastifyInstance {
    storage: DocumentStorage;
  }
}

const storagePlugin: FastifyPluginAsync<{ rootDir: string }> = async (app, options) => {
  app.decorate('storage', new LocalFilesystemStorage({ rootDir: options.rootDir }));
};

export default fp(storagePlugin, {
  name: 'storage',
});
