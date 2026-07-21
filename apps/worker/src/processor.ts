import type { Job } from 'bullmq';
import type { CertificateJobName, CertificateJobPayloadMap } from '@certificates/queue';
import type { Logger } from 'pino';

export async function processCertificateJob(
  job: Job<CertificateJobPayloadMap[CertificateJobName], void, CertificateJobName>,
  logger: Logger,
): Promise<void> {
  logger.info(
    {
      jobId: job.id,
      jobName: job.name,
    },
    'Received placeholder certificate job (no-op)',
  );
}
