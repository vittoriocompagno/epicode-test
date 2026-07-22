import { Writable } from 'node:stream';
import pino, { type Logger } from 'pino';
import { describe, expect, it } from 'vitest';
import { createApiLoggerOptions } from '../src/logging.js';

function captureLog(write: (logger: Logger) => void): Record<string, unknown> {
  let entry: Record<string, unknown> | undefined;
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      entry = JSON.parse(chunk.toString()) as Record<string, unknown>;
      callback();
    },
  });

  write(pino(createApiLoggerOptions('production'), destination));

  if (!entry) {
    throw new Error('Expected a log entry');
  }
  return entry;
}

describe('API logging', () => {
  it('includes service and environment fields', () => {
    const entry = captureLog((logger) => logger.info('ready'));

    expect(entry).toMatchObject({
      service: 'certificate-api',
      environment: 'production',
    });
  });

  it('redacts authentication headers', () => {
    const entry = captureLog((logger) =>
      logger.info({
        req: {
          headers: {
            'x-api-key': 'api-secret',
            authorization: 'Bearer token',
          },
        },
      }),
    );

    expect(entry.req).toEqual({
      headers: {
        'x-api-key': '[Redacted]',
        authorization: '[Redacted]',
      },
    });
  });
});
