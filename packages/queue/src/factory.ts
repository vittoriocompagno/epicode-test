import { Queue, type JobsOptions, type QueueOptions } from 'bullmq';
import type { DispatchBatchJob, GenerateCertificateJob } from '@certificates/contracts';
import {
  batchDispatchJobId,
  certificateJobId,
  defaultJobOptions,
  QUEUE_NAMES,
  type BatchDispatchJobName,
  type CertificateJobName,
} from './jobs.js';
import { parseRedisUrl } from './redis.js';

export type CertificateQueue = Queue<GenerateCertificateJob, void, CertificateJobName>;
export type BatchDispatchQueue = Queue<DispatchBatchJob, void, BatchDispatchJobName>;

export function createCertificateQueue(
  redisUrl: string,
  options: Omit<QueueOptions, 'connection' | 'defaultJobOptions'> = {},
): CertificateQueue {
  return new Queue<GenerateCertificateJob, void, CertificateJobName>(QUEUE_NAMES.certificateJobs, {
    connection: parseRedisUrl(redisUrl),
    defaultJobOptions,
    ...options,
  });
}

export function createBatchDispatchQueue(
  redisUrl: string,
  options: Omit<QueueOptions, 'connection' | 'defaultJobOptions'> = {},
): BatchDispatchQueue {
  return new Queue<DispatchBatchJob, void, BatchDispatchJobName>(QUEUE_NAMES.batchDispatch, {
    connection: parseRedisUrl(redisUrl),
    defaultJobOptions,
    ...options,
  });
}

export async function enqueueCertificateGeneration(
  queue: CertificateQueue,
  documentId: string,
  jobOptions: JobsOptions = {},
): Promise<string> {
  const jobId = certificateJobId(documentId);
  const job = await queue.add(
    'generate-certificate',
    { documentId },
    {
      jobId,
      ...jobOptions,
    },
  );
  return job.id ?? jobId;
}

export async function enqueueBatchDispatch(
  queue: BatchDispatchQueue,
  batchId: string,
  jobOptions: JobsOptions = {},
): Promise<string> {
  const jobId = batchDispatchJobId(batchId);
  const job = await queue.add(
    'dispatch-batch',
    { batchId },
    {
      jobId,
      ...jobOptions,
    },
  );
  return job.id ?? jobId;
}
