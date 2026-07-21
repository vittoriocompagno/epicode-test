import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { isAppError } from '../errors.js';

function isFastifyError(error: unknown): error is FastifyError {
  return typeof error === 'object' && error !== null && 'message' in error;
}

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, code: error.code }, 'application error');
      } else {
        request.log.warn({ code: error.code, details: error.details }, error.message);
      }

      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
      });
    }

    if (isFastifyError(error) && error.statusCode === 413) {
      return reply.code(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload is too large',
          details: {},
        },
      });
    }

    if (isFastifyError(error) && error.statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          details: {},
        },
      });
    }

    request.log.error({ err: error }, 'unexpected error');

    const statusCode =
      isFastifyError(error) && typeof error.statusCode === 'number' ? error.statusCode : 500;

    return reply.code(statusCode >= 400 ? statusCode : 500).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message:
          statusCode >= 500
            ? 'An unexpected error occurred'
            : isFastifyError(error)
              ? error.message
              : 'Request failed',
        details: {},
      },
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
