import { QUEUE_NAMES } from './names.js';

export type CertificateJobName = 'generate-certificate';
export type BatchDispatchJobName = 'dispatch-batch';

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2_000,
  },
  removeOnComplete: 100,
  removeOnFail: 200,
};

export function certificateJobId(documentId: string): string {
  return `generate-${documentId}`;
}

export function batchDispatchJobId(batchId: string): string {
  return `dispatch-${batchId}`;
}

export { QUEUE_NAMES };
