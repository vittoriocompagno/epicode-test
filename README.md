# Certificate Generation API

TypeScript monorepo for certificate templates, draft documents, asynchronous PDF generation, and bulk dispatch.

```text
Client
  ↓
Fastify API  ──PostgreSQL──┐
  ↓                        │
BullMQ / Redis             │
  ↓                        │
Worker replicas ───────────┘
  ↓
Handlebars → Playwright PDF → Local storage (+ optional Mailpit)
```

API and worker are independently runnable. PDF generation never runs inside the API process.

## Stack

| Area | Technology |
| --- | --- |
| API | Fastify, Zod, Drizzle, BullMQ producer |
| Worker | BullMQ consumers, Playwright Chromium, Nodemailer |
| Packages | `contracts`, `database`, `queue`, `rendering`, `storage` |
| Infra | PostgreSQL, Redis, Mailpit |

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm --filter @certificates/api dev
pnpm --filter @certificates/worker dev
```

All HTTP routes require:

```http
X-API-Key: <API_KEY>
```

## Architecture decisions

### Async generation

1. `POST /api/documents/:id/generate` validates state, sets `queued`, enqueues `{ documentId }`, returns `202`.
2. The worker claims the row with an atomic `queued → processing` update.
3. It renders HTML with the shared Handlebars engine, creates a PDF through `PdfRenderer`, stores a logical key via `DocumentStorage`, then marks `completed`.
4. Email is optional and runs after PDF persistence. SMTP failure does not roll back the PDF.

### Idempotency

- BullMQ job id: `generate-<documentId>`
- Completed documents short-circuit as no-ops
- Processing ownership uses a conditional SQL update (not check-then-update)
- Storage key: `documents/<documentId>.pdf`
- Retries reuse the same document row

BullMQ may deliver jobs more than once; the worker is therefore written to tolerate duplicates.

### State machine

| From | To | Trigger |
| --- | --- | --- |
| `draft` | `queued` | generate |
| `failed` | `queued` | retry / generate |
| `queued` | `processing` | worker claim |
| `processing` | `completed` | PDF stored |
| `processing` | `failed` | final worker failure |
| `queued` / `processing` / `completed` | same | generate returns current state (no duplicate work) |
| `processing` | `queued` | transient worker failure (BullMQ will retry) |
| `processing` | `failed` | final worker failure after max attempts |

### Bulk generation

`POST /api/batches` validates every item, bulk-inserts documents + batch items, and enqueues one `dispatch-batch` job.

The dispatcher loads pending items in chunks (default 500), uses `addBulk`, and marks items `queued`. Progress on `GET /api/batches/:id` is computed from `batch_items` status counts.

### PDF renderer

`PdfRenderer` is the dependency boundary. Production code uses `PlaywrightPdfRenderer`:

- shared Chromium browser
- new isolated context/page per job
- JavaScript disabled
- non-`data:` / non-`about:blank` requests aborted
- timeout + max HTML size
- closed on worker shutdown

Tests inject `FakePdfRenderer`.

### Storage

`LocalFilesystemStorage` stores objects under `LOCAL_STORAGE_PATH` using logical keys. Absolute filesystem paths are never returned by the API. Production should replace this with S3-compatible storage.

### Email policy

- Sent only when `emailTo` is set and `MAIL_ENABLED=true`
- Runs after successful PDF storage
- Failures set `email_status=failed` without regenerating the PDF

## HTTP API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Auth required |
| `GET/POST/PATCH/DELETE` | `/api/templates...` | CRUD + preview |
| `GET/POST/PATCH/DELETE` | `/api/documents...` | Draft CRUD |
| `POST` | `/api/documents/:id/generate` | `202` enqueue |
| `POST` | `/api/documents/:id/retry` | failed only |
| `GET` | `/api/documents/:id/status` | poll payload |
| `GET` | `/api/documents/:id/download` | `application/pdf` |
| `POST` | `/api/batches` | up to 10,000 items |
| `GET` | `/api/batches/:id` | progress |

### cURL examples

```bash
export API_KEY=development-api-key

# generate
curl -s -X POST "http://localhost:3000/api/documents/$DOCUMENT_ID/generate" \
  -H "X-API-Key: $API_KEY"

# status
curl -s "http://localhost:3000/api/documents/$DOCUMENT_ID/status" \
  -H "X-API-Key: $API_KEY"

# retry
curl -s -X POST "http://localhost:3000/api/documents/$DOCUMENT_ID/retry" \
  -H "X-API-Key: $API_KEY"

# download
curl -s -OJ "http://localhost:3000/api/documents/$DOCUMENT_ID/download" \
  -H "X-API-Key: $API_KEY"

# batch (truncated example)
curl -s -X POST http://localhost:3000/api/batches \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"templateId":"'"$TEMPLATE_ID"'","items":[{"variables":{"name":"Ada"}}]}'

# batch progress
curl -s "http://localhost:3000/api/batches/$BATCH_ID" \
  -H "X-API-Key: $API_KEY"
```

## Queues

| Queue | Job name | Payload |
| --- | --- | --- |
| `certificate-jobs` | `generate-certificate` | `{ documentId }` |
| `batch-dispatch` | `dispatch-batch` | `{ batchId }` |

Default attempts: 3, exponential backoff 2s.

## Scripts

```bash
pnpm db:migrate
pnpm test
pnpm test:load          # default LOAD_TEST_JOBS=10000
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test:load` pauses the certificate queue, measures bulk `202` latency, concurrent `/health` latency, persisted item counts, and dispatched job counts. It does not render 10,000 PDFs.

### Measured locally (2026-07-21, MacBook Air, Docker Postgres/Redis)

| Metric | Value |
| --- | --- |
| `LOAD_TEST_JOBS` | 10000 |
| Bulk endpoint | `202` in ~817 ms |
| Concurrent `/health` | ~1 ms |
| Batch items persisted | 10000 |
| Jobs dispatched | 10000 |
| Duplicates / lost | 0 / 0 |

## Horizontal scaling

Start multiple worker processes with the same Redis/Postgres configuration:

```bash
WORKER_CONCURRENCY=4 pnpm --filter @certificates/worker start
```

Workers share queues; atomic `queued → processing` prevents double generation.

## Known limitations

- Local filesystem storage is single-host
- In-memory rate limiting is used if Redis is unavailable at API boot
- Load test isolates enqueue/dispatch throughput from Chromium rendering
- Operator UI is not implemented in this phase
