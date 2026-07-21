import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES } from '@certificates/queue';
import { loadEnv } from './env.js';

describe('worker foundation', () => {
  it('loads concurrency and chunk size from the environment', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/certificates',
      REDIS_URL: 'redis://localhost:6379',
      WORKER_CONCURRENCY: '4',
      BATCH_DISPATCH_CHUNK_SIZE: '250',
      LOCAL_STORAGE_PATH: './data/documents',
      MAIL_ENABLED: 'false',
    });

    expect(env.WORKER_CONCURRENCY).toBe(4);
    expect(env.BATCH_DISPATCH_CHUNK_SIZE).toBe(250);
  });

  it('targets the shared certificate jobs queue', () => {
    expect(QUEUE_NAMES.certificateJobs).toBe('certificate-jobs');
    expect(QUEUE_NAMES.batchDispatch).toBe('batch-dispatch');
  });
});
