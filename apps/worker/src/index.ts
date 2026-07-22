import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import pino from 'pino';
import { closeDatabaseClient, createDatabaseClient } from '@certificates/database';
import {
  QUEUE_NAMES,
  createRedisConnection,
  defaultJobOptions,
  type BatchDispatchJobName,
  type CertificateJobName,
} from '@certificates/queue';
import type { DispatchBatchJob, GenerateCertificateJob } from '@certificates/contracts';
import { PlaywrightPdfRenderer } from '@certificates/rendering';
import { LocalFilesystemStorage } from '@certificates/storage';
import { createCertificateQueue, dispatchBatch } from './dispatch.js';
import { generateCertificateDocument } from './generate.js';
import { loadEnv } from './env.js';
import { attachWorkerOperationalLogging, createWorkerLoggerOptions } from './logging.js';

const env = loadEnv();
const logger = pino(createWorkerLoggerOptions(env.NODE_ENV));

async function bootstrap(): Promise<void> {
  const database = createDatabaseClient(env.DATABASE_URL);
  const storage = new LocalFilesystemStorage({ rootDir: env.LOCAL_STORAGE_PATH });
  const pdfRenderer = new PlaywrightPdfRenderer({ timeoutMs: env.PDF_TIMEOUT_MS });
  const redis = createRedisConnection(env.REDIS_URL, 'worker');
  const certificateQueue = createCertificateQueue(env.REDIS_URL);
  const maxAttempts = defaultJobOptions.attempts;

  const mailer = env.MAIL_ENABLED
    ? nodemailer.createTransport({
        host: env.MAIL_HOST,
        port: env.MAIL_PORT,
        secure: false,
      })
    : null;

  const generationDeps = {
    db: database.db,
    storage,
    pdfRenderer,
    mailer,
    mailFrom: env.MAIL_FROM,
  };

  const certificateWorker = new Worker<GenerateCertificateJob, void, CertificateJobName>(
    QUEUE_NAMES.certificateJobs,
    async (job) => {
      const jobLogger = logger.child({ correlationId: job.data.correlationId });
      jobLogger.info(
        { jobId: job.id, documentId: job.data.documentId, attempt: job.attemptsMade + 1 },
        'job received',
      );
      await generateCertificateDocument(
        job.data.documentId,
        { ...generationDeps, logger: jobLogger },
        job.attemptsMade + 1,
        maxAttempts,
      );
    },
    {
      connection: redis,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  const dispatchWorker = new Worker<DispatchBatchJob, void, BatchDispatchJobName>(
    QUEUE_NAMES.batchDispatch,
    async (job) => {
      const jobLogger = logger.child({ correlationId: job.data.correlationId });
      jobLogger.info({ jobId: job.id, batchId: job.data.batchId }, 'dispatch job received');
      await dispatchBatch(job.data, {
        db: database.db,
        certificateQueue,
        chunkSize: env.BATCH_DISPATCH_CHUNK_SIZE,
        logger: jobLogger,
      });
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  attachWorkerOperationalLogging(certificateWorker, QUEUE_NAMES.certificateJobs, logger);
  attachWorkerOperationalLogging(dispatchWorker, QUEUE_NAMES.batchDispatch, logger);

  certificateWorker.on('ready', () => {
    logger.info(
      { queue: QUEUE_NAMES.certificateJobs, concurrency: env.WORKER_CONCURRENCY },
      'Certificate worker ready',
    );
  });

  dispatchWorker.on('ready', () => {
    logger.info({ queue: QUEUE_NAMES.batchDispatch }, 'Batch dispatch worker ready');
  });

  certificateWorker.on('failed', (job, error) => {
    logger.error(
      {
        err: error,
        jobId: job?.id,
        documentId: job?.data.documentId,
        correlationId: job?.data.correlationId,
        attempt: job?.attemptsMade,
      },
      'Certificate job failed',
    );
  });

  dispatchWorker.on('failed', (job, error) => {
    logger.error(
      {
        err: error,
        jobId: job?.id,
        batchId: job?.data.batchId,
        correlationId: job?.data.correlationId,
      },
      'Dispatch job failed',
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down worker');

    try {
      await Promise.all([certificateWorker.close(), dispatchWorker.close()]);
      await certificateQueue.close();
      await redis.quit();
      await closeDatabaseClient(database);
      await pdfRenderer.close();
      if (mailer) {
        mailer.close();
      }
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Worker shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});
