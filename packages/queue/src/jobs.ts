import type { BulkGenerateJob, GenerateCertificateJob } from '@certificates/contracts';
import { QUEUE_NAMES } from './names.js';

export type CertificateJobName = 'generate-certificate' | 'bulk-generate';

export type CertificateJobPayloadMap = {
  'generate-certificate': GenerateCertificateJob;
  'bulk-generate': BulkGenerateJob;
};

export type CertificateQueueJobs = {
  [K in CertificateJobName]: {
    name: K;
    data: CertificateJobPayloadMap[K];
  };
}[CertificateJobName];

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2_000,
  },
  removeOnComplete: 100,
  removeOnFail: 200,
};

export { QUEUE_NAMES };
