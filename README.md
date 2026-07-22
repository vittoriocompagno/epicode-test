# Certificate Generation API

Backend service for managing certificate templates and documents, rendering PDFs asynchronously, and dispatching large generation batches without blocking API requests.

The repository is a TypeScript monorepo built around Fastify, PostgreSQL, BullMQ, Redis, Handlebars, and Playwright.

## Quick start

Requirements: Node.js 22 or newer, pnpm 11, and Docker.

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

| Service    | Address               |
| ---------- | --------------------- |
| API        | http://localhost:3000 |
| Mailpit UI | http://localhost:8025 |
| PostgreSQL | localhost:5432        |
| Redis      | localhost:6379        |

Every route, including `/health`, requires the API key configured in `.env`:

```bash
curl --fail \
  --header "X-API-Key: $API_KEY" \
  http://localhost:3000/health
```

## Live deployment

The API is available at <https://certificates.compagno.cc>. The production key is shared separately from the repository.

```bash
export CERTIFICATES_API_KEY='<key-shared-separately>'
curl --fail \
  --header "X-API-Key: $CERTIFICATES_API_KEY" \
  https://certificates.compagno.cc/health
```

## Architecture

```text
                         PostgreSQL
                            ▲   ▲
                            │   │
Client ── HTTP 202 ──> Fastify API ──> BullMQ / Redis
                            │                 │
                            │                 ▼
                            │         Certificate workers
                            │                 │
                            │       Handlebars + Playwright
                            │                 │
                            └──── shared PDF storage
                                              │
                                           Mailpit
```

The API validates input, persists state, and enqueues jobs. It never renders a PDF. Workers run as separate processes and can scale independently by increasing `WORKER_CONCURRENCY` or adding replicas.

The main boundaries are:

```text
apps/api                 HTTP routes, services, repositories, middleware
apps/worker              BullMQ consumers and lifecycle management
packages/contracts       Zod schemas and shared types
packages/database        Drizzle schema, migrations, and DB helpers
packages/queue           Queue names, payloads, and enqueue helpers
packages/rendering       Template validation and PDF renderer
packages/storage         Document storage interface and local adapter
docs/API.md              Human-readable API reference
docs/openapi.yaml        Machine-readable OpenAPI contract
scripts                  Demo and load-test flows
```

## API documentation

- [`docs/API.md`](docs/API.md) contains authentication, endpoints, payloads, responses, errors, limits, and complete request flows.
- [`docs/openapi.yaml`](docs/openapi.yaml) is the machine-readable OpenAPI 3.0 contract.

Main routes:

```text
GET    /health
GET    /api/overview

GET    /api/templates
POST   /api/templates
GET    /api/templates/:templateId
PATCH  /api/templates/:templateId
DELETE /api/templates/:templateId
POST   /api/templates/:templateId/preview
POST   /api/templates/preview

GET    /api/documents
POST   /api/documents
GET    /api/documents/:documentId
PATCH  /api/documents/:documentId
DELETE /api/documents/:documentId
POST   /api/documents/:documentId/generate
POST   /api/documents/:documentId/retry
GET    /api/documents/:documentId/status
GET    /api/documents/:documentId/download

POST   /api/batches
GET    /api/batches
GET    /api/batches/:batchId
```

## Rendering and generation

Templates use Handlebars expressions such as `{{student.name}}`. Values are HTML-escaped, unsafe template constructs are rejected, missing variables produce a validation error, and inherited JavaScript properties are not accessible.

Generation follows this state flow:

```text
draft ── generate ──> queued ── worker claim ──> processing
  ▲                                                   │
  │                                                   ├──> completed
  └──────────── retry <──────────── failed <──────────┘
```

`POST /api/documents/:documentId/generate` returns `202` after enqueueing a stable BullMQ job. The worker renders the HTML, creates the PDF, writes it to storage, updates the document, and optionally sends it as an email attachment.

Duplicate delivery is safe:

- BullMQ job ID: `generate-<documentId>`
- atomic SQL transition when a worker claims a document
- deterministic storage key: `documents/<documentId>.pdf`
- completed documents are no-ops when generation is requested again

## Bulk generation

`POST /api/batches` inserts documents and batch items in bulk, enqueues one dispatcher job, and returns `202`. The dispatcher reads pending items in configurable chunks and calls BullMQ `addBulk`, keeping thousands of Redis writes out of the HTTP request.

Batch progress is derived from document state rather than maintained as a second competing state machine.

The load test enqueues 10,000 jobs and verifies API responsiveness, persisted items, queued jobs, duplicates, and losses:

```bash
pnpm test:load
```

It intentionally does not render 10,000 Chromium PDFs; rendering throughput depends on worker count and available CPU and memory.

## Security

- one global API-key middleware protects every route
- API keys are read from environment configuration and compared with `timingSafeEqual`
- Zod validates request bodies, query strings, identifiers, and environment variables
- Handlebars output is escaped and unsafe syntax is rejected
- Playwright disables JavaScript and blocks external, `file://`, and unexpected requests
- preview, generation, retry, and batch routes have rate and payload limits
- storage responses expose logical keys, never absolute filesystem paths

## Testing

```bash
pnpm test
```

The command builds shared packages, creates and migrates the configured test database idempotently, and runs rendering, API, queue, and worker tests. Worker coverage uses real PostgreSQL and Redis and includes successful processing, retries, terminal failure, duplicate job IDs, and the batch-dispatch race.

Additional checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:load
```

## Container deployment

GitHub Actions runs linting, type checking, builds, and tests before publishing two images:

```text
ghcr.io/<owner>/epicode-test/api:latest
ghcr.io/<owner>/epicode-test/worker:latest
```

`docker-compose.coolify.yml` defines the API, worker, PostgreSQL, Redis, Mailpit, and persistent volumes. Coolify requires `API_KEY` and `POSTGRES_PASSWORD`; other settings have defaults in the Compose file.

The API and workers share the same internal services:

```env
DATABASE_URL=postgresql://certificates:<password>@postgres:5432/certificates
REDIS_URL=redis://redis:6379
LOCAL_STORAGE_PATH=/data/documents
```

Deployment details:

- expose only the API on port `3000`
- mount the `documents` volume at `/data/documents` in the API and every worker
- the API image applies database migrations before starting Fastify
- workers never run migrations
- the API liveness check does not query PostgreSQL and allows startup time for migrations
- workers close BullMQ, Redis, PostgreSQL, Playwright, and mail resources on `SIGINT` or `SIGTERM`

Local filesystem storage is appropriate for a single-host deployment with a shared volume. A multi-host deployment should replace the `DocumentStorage` adapter with S3-compatible storage.

## Commands

| Command              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `pnpm dev`           | Run API and workers in watch mode            |
| `pnpm build`         | Build all packages and applications          |
| `pnpm lint`          | Run ESLint                                   |
| `pnpm typecheck`     | Type-check the workspace                     |
| `pnpm test`          | Run the complete automated test suite        |
| `pnpm test:load`     | Run the 10,000-job enqueue test              |
| `pnpm db:migrate`    | Apply database migrations                    |
| `pnpm demo:seed`     | Create sample templates and documents        |
| `pnpm demo:generate` | Generate, poll, download, and verify one PDF |
