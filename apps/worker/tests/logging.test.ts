import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import pino, { type Logger } from 'pino';
import { describe, expect, it } from 'vitest';
import { attachWorkerOperationalLogging, createWorkerLoggerOptions } from '../src/logging.js';

function captureLogs(run: (logger: Logger) => void): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      entries.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });

  run(pino(createWorkerLoggerOptions('production'), destination));
  return entries;
}

describe('worker logging', () => {
  it('includes service metadata and redacts credentials', () => {
    const [entry] = captureLogs((logger) =>
      logger.info({ headers: { 'x-api-key': 'api-secret', authorization: 'Bearer token' } }),
    );

    expect(entry).toMatchObject({
      service: 'certificate-worker',
      environment: 'production',
      headers: {
        'x-api-key': '[Redacted]',
        authorization: '[Redacted]',
      },
    });
  });

  it('logs worker errors and stalled jobs with queue context', () => {
    const worker = new EventEmitter();
    const entries = captureLogs((logger) => {
      attachWorkerOperationalLogging(worker, 'certificate-jobs', logger);
      worker.emit('error', new Error('redis unavailable'));
      worker.emit('stalled', 'job-123', 'active');
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      level: 50,
      queue: 'certificate-jobs',
      err: { message: 'redis unavailable' },
    });
    expect(entries[1]).toMatchObject({
      level: 40,
      queue: 'certificate-jobs',
      jobId: 'job-123',
      previousState: 'active',
    });
  });
});
