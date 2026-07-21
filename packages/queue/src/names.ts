export const QUEUE_NAMES = {
  certificateJobs: 'certificate-jobs',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
