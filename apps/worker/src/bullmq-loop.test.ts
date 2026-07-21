import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QueueEvents, Worker } from 'bullmq';
import pino from 'pino';
import {
  closeDatabaseClient,
  createDatabaseClient,
  documents,
  templates,
  type DatabaseClient,
} from '@certificates/database';
import {
  QUEUE_NAMES,
  createCertificateQueue,
  createRedisConnection,
  enqueueCertificateGeneration,
  parseRedisUrl,
  type CertificateJobName,
  type CertificateQueue,
} from '@certificates/queue';
import type { GenerateCertificateJob } from '@certificates/contracts';
import { FakePdfRenderer } from '@certificates/rendering';
import { LocalFilesystemStorage } from '@certificates/storage';
import { eq } from 'drizzle-orm';
import { generateCertificateDocument } from './generate.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/certificates_test';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('BullMQ certificate worker loop', () => {
  let dbClient: DatabaseClient;
  let tempDir: string;
  let storage: LocalFilesystemStorage;
  let queue: CertificateQueue;
  let queueEvents: QueueEvents;
  let worker: Worker<GenerateCertificateJob, void, CertificateJobName>;
  let workerRedis: ReturnType<typeof createRedisConnection>;
  const renderer = new FakePdfRenderer();
  const logger = pino({ level: 'silent' });
  const prefix = `{bullmq-loop-${randomUUID()}}`;

  beforeAll(async () => {
    dbClient = createDatabaseClient(databaseUrl);
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'cert-bullmq-'));
    storage = new LocalFilesystemStorage({ rootDir: tempDir });

    queue = createCertificateQueue(redisUrl, { prefix });
    queueEvents = new QueueEvents(QUEUE_NAMES.certificateJobs, {
      connection: parseRedisUrl(redisUrl),
      prefix,
    });
    await queueEvents.waitUntilReady();

    workerRedis = createRedisConnection(redisUrl, true);
    worker = new Worker<GenerateCertificateJob, void, CertificateJobName>(
      QUEUE_NAMES.certificateJobs,
      async (job) => {
        await generateCertificateDocument(
          job.data.documentId,
          {
            db: dbClient.db,
            storage,
            pdfRenderer: renderer,
            mailer: null,
            mailFrom: 'test@localhost',
            logger,
          },
          job.attemptsMade + 1,
          job.opts.attempts ?? 3,
        );
      },
      {
        connection: workerRedis,
        concurrency: 1,
        prefix,
      },
    );
    await worker.waitUntilReady();
  }, 30_000);

  afterAll(async () => {
    await worker.close();
    await queueEvents.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await workerRedis.quit();
    await closeDatabaseClient(dbClient);
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await dbClient.sql`truncate table batch_items, generation_batches, documents, templates restart identity cascade`;
    renderer.calls.length = 0;
    renderer.failNext = false;
    renderer.failAlways = false;
  });

  async function seedQueuedDocument() {
    const [template] = await dbClient.db
      .insert(templates)
      .values({
        name: 'Diploma',
        html: '<h1>{{studentName}}</h1>',
        variables: ['studentName'],
      })
      .returning();

    const [document] = await dbClient.db
      .insert(documents)
      .values({
        templateId: template!.id,
        variables: { studentName: 'Ada' },
        status: 'queued',
      })
      .returning();

    return document!;
  }

  it('processes an enqueued job through BullMQ to completion', async () => {
    const document = await seedQueuedDocument();
    const jobId = await enqueueCertificateGeneration(queue, document.id, {
      attempts: 1,
      backoff: { type: 'fixed', delay: 50 },
    });

    const job = await queue.getJob(jobId);
    await job!.waitUntilFinished(queueEvents, 15_000);

    const [updated] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(updated?.status).toBe('completed');
    expect(updated?.outputPath).toBe(`documents/${document.id}.pdf`);
    expect(renderer.calls).toHaveLength(1);
  }, 20_000);

  it('retries a failed attempt then completes on the next BullMQ attempt', async () => {
    const document = await seedQueuedDocument();
    renderer.failNext = true;

    const jobId = await enqueueCertificateGeneration(queue, document.id, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 50 },
    });

    const job = await queue.getJob(jobId);
    await job!.waitUntilFinished(queueEvents, 15_000);

    const [updated] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(updated?.status).toBe('completed');
    expect(renderer.calls).toHaveLength(2);
  }, 20_000);

  it('marks the document failed when BullMQ exhausts attempts', async () => {
    const document = await seedQueuedDocument();
    renderer.failAlways = true;

    const jobId = await enqueueCertificateGeneration(queue, document.id, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 50 },
    });

    const job = await queue.getJob(jobId);
    await expect(job!.waitUntilFinished(queueEvents, 15_000)).rejects.toThrow(
      /Fake PDF renderer failure/,
    );

    const [updated] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(updated?.status).toBe('failed');
    expect(updated?.errorCode).toBe('GENERATION_FAILED');
    expect(renderer.calls.length).toBeGreaterThanOrEqual(2);
  }, 20_000);
});
