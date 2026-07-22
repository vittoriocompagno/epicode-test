import type { LoggerOptions } from 'pino';
import type { Env } from './env.js';

const REDACT_PATHS = [
  'req.headers["x-api-key"]',
  'req.headers.authorization',
  'headers["x-api-key"]',
  'headers.authorization',
];

export function createApiLoggerOptions(environment: Env['NODE_ENV']): LoggerOptions {
  return {
    level: environment === 'test' ? 'error' : environment === 'production' ? 'info' : 'debug',
    base: {
      service: 'certificate-api',
      environment,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
  };
}
