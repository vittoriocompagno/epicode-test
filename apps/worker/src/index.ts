import { Worker } from 'bullmq';
import pino from 'pino';
import { chromium, type Browser } from 'playwright';
import {
  closeDatabaseClient,
  createDatabaseClient,
  type DatabaseClient,
} from '@certificates/database';
import {
  QUEUE_NAMES,
  createRedisConnection,
  type CertificateJobName,
  type CertificateJobPayloadMap,
} from '@certificates/queue';
import { closeRenderingResources } from '@certificates/rendering';
import { loadEnv } from './env.js';
import { processCertificateJob } from './processor.js';

const env = loadEnv();
const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
});

let browser: Browser | null = null;
let database: DatabaseClient | null = null;
const redis = createRedisConnection(env.REDIS_URL, true);
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  database = createDatabaseClient(env.DATABASE_URL);
  browser = await chromium.launch({ headless: true });

  const worker = new Worker<
    CertificateJobPayloadMap[CertificateJobName],
    void,
    CertificateJobName
  >(
    QUEUE_NAMES.certificateJobs,
    async (job) => processCertificateJob(job, logger),
    {
      connection: redis,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on('ready', () => {
    logger.info(
      {
        queue: QUEUE_NAMES.certificateJobs,
        concurrency: env.WORKER_CONCURRENCY,
      },
      'Worker ready',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error({ err: error, jobId: job?.id }, 'Job failed');
  });

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down worker');

    try {
      await worker.close();
      await redis.quit();
      if (database) {
        await closeDatabaseClient(database);
      }
      await closeRenderingResources();
      if (browser) {
        await browser.close();
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
