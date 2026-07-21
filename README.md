# Certificate Generation

TypeScript monorepo: Fastify API, BullMQ worker, React control plane, shared packages.

## Quick start

Requires **Node ≥ 22** and **pnpm 11** (`packageManager` field in `package.json`).

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

| Service | URL |
| --- | --- |
| Web console | http://localhost:5173 |
| API | http://localhost:3000 |
| Mailpit UI | http://localhost:8025 |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |

Development API key (from `.env.example`):

```text
development-api-key
```

Enter that key in the web console (stored in `sessionStorage` only). This is a local challenge interface, not production authentication.

Optional demo against a running API + worker:

```bash
pnpm demo:seed
pnpm demo:generate
```

## Architecture

Independently runnable deployment units in one monorepo — not a microservice platform.

```text
React control plane
        |
        | X-API-Key
        v
Fastify API
        |
        +------ PostgreSQL
        |
        +------ BullMQ / Redis
                    |
                    +------ Batch dispatcher
                    |
                    +------ Certificate worker replicas
                                  |
                                  +------ Handlebars renderer
                                  +------ Playwright PDF renderer
                                  +------ Document storage
                                  +------ Mailpit
```

PDF generation never runs inside the API process.

## Repository structure

```text
apps/api       Fastify HTTP API
apps/worker    BullMQ consumers (certificate + batch dispatch)
apps/web       React evaluator console
packages/contracts   Zod schemas + shared types
packages/database    Drizzle schema + migrations
packages/queue       BullMQ helpers
packages/rendering   Handlebars + PdfRenderer
packages/storage     DocumentStorage (local FS)
docs/          OpenAPI + review notes
scripts/       load test + demo flows
```

## Root commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Build packages, then run web + API + worker |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm test` | Unit/integration suite |
| `pnpm test:load` | 10,000-item batch enqueue responsiveness |
| `pnpm db:generate` | Generate Drizzle migration |
| `pnpm db:migrate` | Apply migrations |
| `pnpm demo:seed` | Idempotent demo template + draft (+ small batch) |
| `pnpm demo:generate` | Public-API smoke: generate → poll → download `%PDF` |

## Frontend usage

1. Open http://localhost:5173
2. Paste `development-api-key`
3. **Templates** — create/edit HTML, preview in a sandboxed iframe (via API)
4. **Documents** — draft → generate → poll → download
5. **Bulk** — small JSON batches and progress (use `pnpm test:load` for 10k)

## API documentation

OpenAPI specification (no unauthenticated Swagger UI):

[`docs/openapi.yaml`](docs/openapi.yaml)

Technical review notes: [`docs/technical-review.md`](docs/technical-review.md)  
Rubric self-assessment: [`docs/rubric-assessment.md`](docs/rubric-assessment.md)

All HTTP routes require:

```http
X-API-Key: development-api-key
```

## PDF generation flow

1. `POST /api/documents/:id/generate` validates, sets `queued`, enqueues `{ documentId }`, returns **202**
2. Worker claims with atomic `queued → processing`
3. Handlebars → `PdfRenderer` → storage key → `completed`
4. Optional email after PDF success (SMTP failure does not roll back the PDF)

### State machine

| From | To | Trigger |
| --- | --- | --- |
| draft | queued | generate |
| failed | queued | retry / generate |
| queued | processing | worker claim |
| processing | queued | transient failure (retry) |
| processing | completed | PDF stored |
| processing | failed | final attempt |
| queued / processing / completed | same | generate is idempotent |

### Idempotency

- Job id `generate-<documentId>`
- Completed no-op
- Conditional SQL claim
- Deterministic storage key `documents/<documentId>.pdf`

## Bulk generation

`POST /api/batches` inserts documents/items in bulk, enqueues one `dispatch-batch` job, returns 202. Dispatcher chunks (default 500) with `addBulk`. Progress on `GET /api/batches/:id` is computed from `batch_items` statuses.

## Security decisions

- API key on **every** route including `/health`
- Timing-safe key comparison
- Escaped Handlebars output; unsafe constructs rejected
- Playwright: JS disabled where possible, external/`file://` blocked, HTML size + timeout
- Rate limits on preview / generate / retry / batch
- No absolute filesystem paths in API responses

## Abstractions

- **PdfRenderer** — Playwright impl + fake for tests
- **DocumentStorage** — local FS now; swap to S3 in production

## Horizontal scaling & shutdown

```bash
WORKER_CONCURRENCY=4 pnpm --filter @certificates/worker start
```

Run multiple worker replicas against the same Redis/Postgres. API and worker close queues, Redis, Postgres, Playwright, and mail transport on `SIGINT`/`SIGTERM`.

## Testing

```bash
pnpm test
pnpm test:load   # default LOAD_TEST_JOBS=10000
```

### Measured load test (local MacBook Air, Docker Postgres/Redis)

| Metric | Value |
| --- | --- |
| Jobs requested | 10000 |
| Bulk `202` latency | ~774 ms |
| Concurrent `/health` | ~1 ms |
| Items / jobs | 10000 / 10000 |
| Duplicates / lost | 0 / 0 |

## Environment

See `.env.example` for `API_KEY`, ports, rate limits, Mailpit, storage path, worker concurrency, and `BATCH_DISPATCH_CHUNK_SIZE`.

## Migrations

Drizzle SQL under `packages/database/drizzle/`. Apply with `pnpm db:migrate`.

## What is implemented vs simplified

| Implemented | Simplified for the challenge |
| --- | --- |
| Full async PDF + bulk pipeline | Single shared API key (no OAuth/users) |
| Local FS storage adapter | Not multi-region object storage |
| Mailpit optional email | Not a full notification product |
| React control plane | `sessionStorage` key gate only |
| OpenAPI file | No hosted Swagger UI |

## Production evolution

- Replace local storage with S3-compatible backend
- Replace shared API key with service identities / OIDC
- Run workers as a separate autoscaled service
- Add metrics/tracing (OpenTelemetry) beside structured logs
- Harden multi-tenant isolation and audit trails

## Known limitations

- Local filesystem storage is single-host
- Load test isolates enqueue/dispatch from Chromium PDF throughput
- Demo seed creates a new small batch each run (template/draft are reused)
