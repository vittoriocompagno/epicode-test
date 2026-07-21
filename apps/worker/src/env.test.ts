import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES } from '@certificates/queue';
import { loadEnv } from './env.js';

describe('worker foundation', () => {
  it('loads concurrency from the environment', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/certificates',
      REDIS_URL: 'redis://localhost:6379',
      WORKER_CONCURRENCY: '4',
      LOCAL_STORAGE_PATH: './data/documents',
    });

    expect(env.WORKER_CONCURRENCY).toBe(4);
  });

  it('targets the shared certificate jobs queue', () => {
    expect(QUEUE_NAMES.certificateJobs).toBe('certificate-jobs');
  });
});
