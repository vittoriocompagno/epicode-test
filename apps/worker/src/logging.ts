import type { EventEmitter } from 'node:events';
import type { Logger, LoggerOptions } from 'pino';
import type { Env } from './env.js';

const REDACT_PATHS = [
  'req.headers["x-api-key"]',
  'req.headers.authorization',
  'headers["x-api-key"]',
  'headers.authorization',
];

export function createWorkerLoggerOptions(environment: Env['NODE_ENV']): LoggerOptions {
  return {
    level: environment === 'production' ? 'info' : 'debug',
    base: {
      service: 'certificate-worker',
      environment,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
  };
}

export function attachWorkerOperationalLogging(
  worker: EventEmitter,
  queue: string,
  logger: Logger,
): void {
  worker.on('error', (error: Error) => {
    logger.error({ err: error, queue }, 'worker error');
  });
  worker.on('stalled', (jobId: string, previousState: string) => {
    logger.warn({ jobId, previousState, queue }, 'job stalled');
  });
}
