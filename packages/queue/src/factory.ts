import { Queue, type QueueOptions } from 'bullmq';
import type { CertificateJobName, CertificateJobPayloadMap } from './jobs.js';
import { defaultJobOptions, QUEUE_NAMES } from './jobs.js';
import { parseRedisUrl } from './redis.js';

export type CertificateQueue = Queue<
  CertificateJobPayloadMap[CertificateJobName],
  void,
  CertificateJobName
>;

export function createCertificateQueue(
  redisUrl: string,
  options: Omit<QueueOptions, 'connection' | 'defaultJobOptions'> = {},
): CertificateQueue {
  const connection = parseRedisUrl(redisUrl);

  return new Queue<CertificateJobPayloadMap[CertificateJobName], void, CertificateJobName>(
    QUEUE_NAMES.certificateJobs,
    {
      connection,
      defaultJobOptions,
      ...options,
    },
  );
}
