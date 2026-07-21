import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * API-key authentication plugin.
 * Prepared for protected routes; health remains public in this foundation phase.
 */
const apiKeyPlugin: FastifyPluginAsync<{ apiKey: string }> = async (app, options) => {
  app.decorate('authenticate', async (request, reply) => {
    const header = request.headers['x-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || provided !== options.apiKey) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Valid x-api-key header is required',
      });
    }
  });
};

export default fp(apiKeyPlugin, {
  name: 'api-key-auth',
});
