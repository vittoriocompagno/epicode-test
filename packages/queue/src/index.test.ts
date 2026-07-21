import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES, defaultJobOptions, parseRedisUrl, certificateJobId } from './index.js';

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
