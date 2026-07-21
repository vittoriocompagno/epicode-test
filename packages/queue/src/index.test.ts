import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES, defaultJobOptions, parseRedisUrl } from './index.js';

describe('queue configuration', () => {
  it('exposes the certificate jobs queue name', () => {
    expect(QUEUE_NAMES.certificateJobs).toBe('certificate-jobs');
  });

  it('parses a redis URL into connection options', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
    });
  });

  it('configures retry defaults for placeholder jobs', () => {
    expect(defaultJobOptions.attempts).toBeGreaterThan(0);
    expect(defaultJobOptions.backoff.type).toBe('exponential');
  });
});
