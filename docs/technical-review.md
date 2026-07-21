# Technical review notes

Concrete answers tied to this monorepo implementation.

## Why BullMQ?

Certificate PDF generation is CPU- and Chromium-heavy. Putting it behind BullMQ lets the Fastify API acknowledge work with HTTP 202 and return immediately, while retries, backoff, and concurrency are handled by the queue. Redis is already part of the local stack, so BullMQ fits without inventing a custom job table.

## Why separate API and worker?

PDF rendering must never run inside the API process. The API is an independently runnable Fastify app that only validates, persists state, and enqueues jobs. The worker is a separate Node process that consumes BullMQ jobs, opens Playwright, writes storage, and optionally sends mail. Either side can restart or scale without taking the other down.

## Why a separate SPA?

The React app is a demonstration control plane for evaluators. Keeping it as Vite + TanStack Router avoids coupling browser UX to Fastify templates, and matches the “independently runnable units in one TypeScript monorepo” shape rather than a true microservice split.

## Why abstract PDF rendering?

`PdfRenderer` in `packages/rendering` is the dependency boundary. Production code uses `PlaywrightPdfRenderer`; tests inject `FakePdfRenderer`. That keeps Chromium out of unit tests and makes a future switch (different browser engine, remote render service) a single adapter change.

## How bulk generation avoids blocking the API

`POST /api/batches` validates items, bulk-inserts documents and batch items, then enqueues **one** `dispatch-batch` job and returns 202. The dispatcher loads pending items in chunks (default 500) and uses BullMQ `addBulk`. API latency grows with DB insert cost, not with per-item Redis round trips for 10,000 certificate jobs.

## How the 10,000-item load test works

`pnpm test:load` builds the API in-process, pauses the certificate queue, posts a 10k-item batch, measures concurrent `/health` latency, runs the dispatcher inline, then counts persisted items and queued jobs. It deliberately does **not** render 10,000 PDFs; Chromium throughput is a separate concern.

## Why jobs contain only identifiers

BullMQ payloads are `{ documentId }` or `{ batchId }`. Templates, variable maps, and PDF buffers stay in PostgreSQL / filesystem. That keeps Redis small, avoids stale embedded copies, and forces the worker to load the current source of truth.

## Retries and idempotency

Default job attempts are 3 with exponential backoff. On a non-final failure the document returns to `queued` so the next attempt can reclaim it. On the final failure it becomes `failed` with a sanitized error. Completed documents short-circuit as no-ops. Storage keys are deterministic (`documents/<id>.pdf`). BullMQ delivery can duplicate; the worker is written for that.

## Duplicate generation prevention

Generate uses stable job id `generate-<documentId>`. If status is already `queued`, `processing`, or `completed`, the API returns the current state without enqueueing another active job. Claiming processing is a single conditional SQL update (`queued → processing`), not check-then-update.

## Worker concurrency

`WORKER_CONCURRENCY` (default 2–4) limits parallel Playwright pages per worker process. Multiple worker replicas can share the same Redis queues; row-level claim prevents two workers from generating the same document.

## Chromium resource management

`PlaywrightPdfRenderer` reuses one browser, opens an isolated context/page per job, disables JavaScript where possible, aborts non-`data:` / non-`about:blank` requests, enforces HTML size and timeout, and closes the browser on worker shutdown (`SIGINT`/`SIGTERM`).

## Variable escaping and network restrictions

Handlebars renders with HTML escaping enabled; AST validation rejects triple-stash / raw constructs and helper/block abuse. The PDF page request interceptor blocks external network and `file://` access.

## Local filesystem storage

`LocalFilesystemStorage` is enough for a single-host challenge: configurable root, path-traversal checks, atomic writes, logical keys only in API responses. Production would swap the adapter for S3-compatible object storage without changing worker orchestration.

## API-key authentication

A single shared `X-API-Key` with timing-safe comparison matches the challenge scope (no multi-tenant IdP). Every route including `/health` requires the key so evaluators cannot stumble into an open surface.

## Demo frontend auth limitations

The SPA stores the key in `sessionStorage` only. That is intentional demo UX, not production identity. Clearing the key or receiving 401 returns to the gate screen. The key is never bundled into Vite env as a client secret for “real” auth.

## Horizontal scaling

Run more worker processes with the same `DATABASE_URL` / `REDIS_URL`. Certificate jobs are distributed by BullMQ; batch dispatch runs with concurrency 1 per process but remains restartable because item status is persistent.

## Dependency failure modes

| Dependency | Effect |
| --- | --- |
| Redis down | Enqueue/consume fails; API returns errors on generate/batch; rate-limit may fall back in-memory |
| PostgreSQL down | All CRUD and worker claims fail loudly |
| SMTP / Mailpit down | PDF still completes; `email_status=failed` recorded |
| Chromium crash | Job fails, retries, then document `failed` after max attempts |
