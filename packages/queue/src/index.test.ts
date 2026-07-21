import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  QUEUE_NAMES,
  certificateJobId,
  createCertificateQueue,
  defaultJobOptions,
  enqueueCertificateGeneration,
  parseRedisUrl,
  type CertificateQueue,
} from './index.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('queue configuration', () => {
  it('exposes certificate and batch queue names', () => {
    expect(QUEUE_NAMES.certificateJobs).toBe('certificate-jobs');
    expect(QUEUE_NAMES.batchDispatch).toBe('batch-dispatch');
  });

  it('parses a redis URL into connection options', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
    });
  });

  it('configures retry defaults and stable job ids', () => {
    expect(defaultJobOptions.attempts).toBeGreaterThan(0);
    expect(defaultJobOptions.backoff.type).toBe('exponential');
    expect(certificateJobId('11111111-1111-4111-8111-111111111111')).toBe(
      'generate-11111111-1111-4111-8111-111111111111',
    );
  });
});

describe('certificate queue against Redis', () => {
  let queue: CertificateQueue;
  const prefix = `{queue-test-${randomUUID()}}`;

  beforeAll(() => {
    queue = createCertificateQueue(redisUrl, { prefix });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('enqueues a generate job with stable id and payload', async () => {
    const documentId = randomUUID();
    const jobId = await enqueueCertificateGeneration(queue, documentId);
    expect(jobId).toBe(certificateJobId(documentId));

    const job = await queue.getJob(jobId);
    expect(job).toBeTruthy();
    expect(job?.name).toBe('generate-certificate');
    expect(job?.data).toEqual({ documentId });

    const state = await job!.getState();
    expect(state).toBe('waiting');
  });

  it('reuses the same job id instead of creating a duplicate active job', async () => {
    const documentId = randomUUID();
    const firstId = await enqueueCertificateGeneration(queue, documentId);
    const secondId = await enqueueCertificateGeneration(queue, documentId);

    expect(secondId).toBe(firstId);
    expect(await queue.getJobCounts('waiting', 'delayed', 'active')).toMatchObject({
      waiting: expect.any(Number),
    });

    const waiting = await queue.getJobs(['waiting', 'delayed', 'active']);
    const matches = waiting.filter((job) => job.id === firstId);
    expect(matches).toHaveLength(1);
  });
});
