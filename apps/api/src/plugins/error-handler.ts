import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

function isFastifyError(error: unknown): error is FastifyError {
  return typeof error === 'object' && error !== null && 'message' in error;
}

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');

    const statusCode =
      isFastifyError(error) && typeof error.statusCode === 'number' ? error.statusCode : 500;

    const name = isFastifyError(error) ? error.name : 'Error';
    const message = isFastifyError(error) ? error.message : 'An unexpected error occurred';

    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : name,
      message: statusCode >= 500 ? 'An unexpected error occurred' : message,
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
