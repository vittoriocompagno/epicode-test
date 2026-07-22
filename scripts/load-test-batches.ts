#!/usr/bin/env tsx
import { performance } from 'node:perf_hooks';
import { createCertificateQueue, QUEUE_NAMES } from '../packages/queue/src/index.ts';
import { buildApp } from '../apps/api/src/app.ts';
import { loadEnv } from '../apps/api/src/env.ts';
import { dispatchBatch } from '../apps/worker/src/dispatch.ts';

const JOBS = Number(process.env.LOAD_TEST_JOBS ?? 10_000);
const API_KEY = process.env.API_KEY ?? 'development-api-key';

const logger = {
  info: (...args: unknown[]) => {
    if (process.env.LOAD_TEST_VERBOSE === 'true') {
      console.log(...args);
    }
  },
};

async function main(): Promise<void> {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    API_KEY,
  });

  const app = await buildApp(env);
  const queue = createCertificateQueue(env.REDIS_URL);
  await queue.obliterate({ force: true });
  await queue.pause();

  await app.db
    .sql`truncate table batch_items, generation_batches, documents, templates restart identity cascade`;

  const template = await app.inject({
    method: 'POST',
    url: '/api/templates',
    headers: {
      'x-api-key': API_KEY,
      'content-type': 'application/json',
    },
    payload: {
      name: 'Load Test',
      html: '<p>{{name}}</p>',
    },
  });

  if (template.statusCode !== 201) {
    throw new Error(`Failed to create template: ${template.body}`);
  }

  const templateId = template.json().id as string;
  const items = Array.from({ length: JOBS }, (_, index) => ({
    variables: { name: `Student ${index}` },
  }));

  const started = performance.now();
  const batchResponsePromise = app.inject({
    method: 'POST',
    url: '/api/batches',
    headers: {
      'x-api-key': API_KEY,
      'content-type': 'application/json',
    },
    payload: {
      templateId,
      items,
    },
  });

  const concurrentStarted = performance.now();
  const healthPromise = app
    .inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-api-key': API_KEY },
    })
    .then((response) => ({
      response,
      latencyMs: performance.now() - concurrentStarted,
    }));

  const [batchResponse, health] = await Promise.all([batchResponsePromise, healthPromise]);
  const bulkMs = performance.now() - started;
  const concurrentMs = health.latencyMs;
  const healthResponse = health.response;

  if (batchResponse.statusCode !== 202) {
    throw new Error(`Bulk endpoint failed: ${batchResponse.body}`);
  }
  if (healthResponse.statusCode !== 200) {
    throw new Error(`Concurrent health check failed: ${healthResponse.body}`);
  }

  const batchId = batchResponse.json().batchId as string;

  await dispatchBatch(batchId, {
    db: app.db.db,
    certificateQueue: queue,
    chunkSize: Number(process.env.BATCH_DISPATCH_CHUNK_SIZE ?? 500),
    logger,
  });

  const counts = await app.db.sql<
    {
      items: number;
      documents: number;
    }[]
  >`
    select
      (select count(*)::int from batch_items where batch_id = ${batchId}) as items,
      (select count(*)::int from documents) as documents
  `;

  const waiting = await queue.getJobCounts('waiting', 'delayed', 'paused', 'prioritized');
  const jobCount =
    (waiting.waiting ?? 0) +
    (waiting.delayed ?? 0) +
    (waiting.paused ?? 0) +
    (waiting.prioritized ?? 0);

  const itemCount = Number(counts[0]?.items ?? 0);
  const documentCount = Number(counts[0]?.documents ?? 0);
  const duplicateCount = Math.max(0, documentCount - JOBS);
  const lostCount = Math.max(0, JOBS - Math.min(itemCount, jobCount));

  console.log(
    JSON.stringify(
      {
        queue: QUEUE_NAMES.certificateJobs,
        requestedJobCount: JOBS,
        bulkEndpointResponseMs: Math.round(bulkMs),
        concurrentApiLatencyMs: Math.round(concurrentMs),
        batchItemsPersisted: itemCount,
        documentsPersisted: documentCount,
        jobsDispatched: jobCount,
        duplicateCount,
        lostCount,
        batchStatusCode: batchResponse.statusCode,
        concurrentStatusCode: healthResponse.statusCode,
      },
      null,
      2,
    ),
  );

  await queue.obliterate({ force: true });
  await queue.close();
  await app.close();

  if (
    batchResponse.statusCode !== 202 ||
    itemCount !== JOBS ||
    jobCount !== JOBS ||
    lostCount > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
