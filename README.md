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

| Service     | URL                   |
| ----------- | --------------------- |
| Web console | http://localhost:5173 |
| API         | http://localhost:3000 |
| Mailpit UI  | http://localhost:8025 |
| Postgres    | `localhost:5432`      |
| Redis       | `localhost:6379`      |

The web console prompts for the `API_KEY` configured in `.env` and keeps it in
`sessionStorage` for the current browser session.

## CI / Docker

GitHub Actions (`.github/workflows/ci.yml`) on every push/PR:

1. **Lint** — `pnpm lint`
2. **Typecheck** — `pnpm typecheck`
3. **Build** — `pnpm build`
4. **Test** — `pnpm test` (Postgres + Redis service containers)
5. **Images** — multi-target `Dockerfile` → GHCR (`web`, `api`, `worker`)

Images are pushed from the default branch; pull requests build them without pushing:

```text
ghcr.io/<owner>/epicode-test/api:latest
ghcr.io/<owner>/epicode-test/worker:latest
ghcr.io/<owner>/epicode-test/web:latest
```

Local image build:

```bash
docker build --target api -t certificates-api .
docker build --target worker -t certificates-worker .
docker build --target web -t certificates-web .
```

Container run expects env vars from `.env.example` (`DATABASE_URL`, `REDIS_URL`, `API_KEY`, `WEB_ORIGIN`, …). Use absolute `LOCAL_STORAGE_PATH` (default in image: `/data/documents`).

## Architecture

Independently runnable deployment units in one monorepo — not a microservice platform.

```text
React web console / Nginx
        |
        | /api + X-API-Key
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

## Deployment architecture

Deploy the web console, API, and worker as separate containers in one private network. API and worker share PostgreSQL, Redis, and the PDF storage volume; only the web console is exposed publicly. Nginx serves the SPA and proxies `/api` to the API container.

```text
                         private deployment network

Internet ── HTTPS ──> Web :80 ── /api ──> API :3000 ─────> PostgreSQL
                                            │                  ▲
                                            │                  │
                                            └──> Redis <──── Worker replicas
                                                   │               │
                                                   └── BullMQ ─────┘

API    ── /data/documents ── shared persistent volume
Worker ── /data/documents ── shared persistent volume
```

Run both images from the same release:

```text
ghcr.io/<owner>/epicode-test/api:latest
ghcr.io/<owner>/epicode-test/worker:latest
ghcr.io/<owner>/epicode-test/web:latest
```

The services connect through internal DNS names supplied by the deployment platform:

```env
DATABASE_URL=postgresql://postgres:<password>@postgres:5432/certificates
REDIS_URL=redis://redis:6379
LOCAL_STORAGE_PATH=/data/documents
```

Deployment requirements:

- Mount the same persistent volume at `/data/documents` in the API and every worker replica. The worker writes PDFs and the API serves them for download.
- Assign the public domain to the web service on port `80`; do not expose the API, workers, PostgreSQL, Redis, or Mailpit publicly.
- Set the same `DATABASE_URL`, `REDIS_URL`, and `LOCAL_STORAGE_PATH` for the API and workers.
- Set `API_KEY` and `WEB_ORIGIN` on the API. Set `WORKER_CONCURRENCY`, `BATCH_DISPATCH_CHUNK_SIZE`, PDF, and mail variables on workers.
- The API image applies database migrations before starting the server. Worker images never run migrations.
- The API healthcheck calls the authenticated, database-independent `/health` endpoint and allows a 30-second start period for migrations.
- Scale certificate throughput by adding worker replicas or increasing `WORKER_CONCURRENCY`; API requests never render PDFs inline.

`docker-compose.coolify.yml` defines the complete production stack. Coolify only needs `API_KEY`, `POSTGRES_PASSWORD`, and `WEB_ORIGIN`; the remaining settings have safe defaults in the Compose file.

For this local-filesystem implementation, API and workers must run on hosts that can mount the same storage. A multi-host deployment should replace `DocumentStorage` with an S3-compatible adapter rather than attempting to synchronize local volumes.

## Repository structure

```text
apps/api       Fastify HTTP API
apps/worker    BullMQ consumers (certificate + batch dispatch)
apps/web       React web console
packages/contracts   Zod schemas + shared types
packages/database    Drizzle schema + migrations
packages/queue       BullMQ helpers
packages/rendering   Handlebars + PdfRenderer
packages/storage     DocumentStorage (local FS)
docs/          OpenAPI + review notes
scripts/       load test + demo flows
```

## Root commands

| Command              | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `pnpm dev`           | Build packages, then run web + API + worker         |
| `pnpm build`         | Build all packages and apps                         |
| `pnpm lint`          | ESLint                                              |
| `pnpm typecheck`     | TypeScript across the workspace                     |
| `pnpm test`          | Unit/integration suite                              |
| `pnpm test:load`     | 10,000-item batch enqueue responsiveness            |
| `pnpm db:generate`   | Generate Drizzle migration                          |
| `pnpm db:migrate`    | Apply migrations                                    |
| `pnpm demo:seed`     | Idempotent demo template + draft (+ small batch)    |
| `pnpm demo:generate` | Public-API smoke: generate → poll → download `%PDF` |

## Frontend usage

1. Open http://localhost:5173
2. Enter the value configured as `API_KEY` in `.env`
3. **Templates** — create/edit HTML, preview in a sandboxed iframe (via API)
4. **Documents** — draft → generate → poll → download
5. **Bulk** — small JSON batches and progress (use `pnpm test:load` for 10k)

## API documentation

OpenAPI specification (no unauthenticated Swagger UI):

[`docs/openapi.yaml`](docs/openapi.yaml)

All HTTP routes require:

```http
X-API-Key: <your-api-key>
```

## PDF generation flow

1. `POST /api/documents/:id/generate` validates, sets `queued`, enqueues `{ documentId }`, returns **202**
2. Worker claims with an atomic transition to `processing` (`queued`, or `draft` only for a batch-dispatch race)
3. Handlebars → `PdfRenderer` → storage key → `completed`
4. Optional email after PDF success (SMTP failure does not roll back the PDF)

### State machine

| From                            | To         | Trigger                   |
| ------------------------------- | ---------- | ------------------------- |
| draft                           | queued     | generate                  |
| draft (batch only)              | processing | worker wins dispatch race |
| failed                          | queued     | retry / generate          |
| queued                          | processing | worker claim              |
| processing                      | queued     | transient failure (retry) |
| processing                      | completed  | PDF stored                |
| processing                      | failed     | final attempt             |
| queued / processing / completed | same       | generate is idempotent    |

### Idempotency

- Job id `generate-<documentId>`
- Completed no-op
- Conditional SQL claim
- Deterministic storage key `documents/<documentId>.pdf`

## Bulk generation

`POST /api/batches` inserts documents/items in bulk, enqueues one `dispatch-batch` job, returns 202. Dispatcher chunks (default 500) with `addBulk`. Progress on `GET /api/batches/:id` is **derived from document statuses** (`batch_items` is a join table, not a second status machine).

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

| Metric               | Value         |
| -------------------- | ------------- |
| Jobs requested       | 10000         |
| Bulk `202` latency   | ~774 ms       |
| Concurrent `/health` | ~1 ms         |
| Items / jobs         | 10000 / 10000 |
| Duplicates / lost    | 0 / 0         |

## Environment

See `.env.example` for `API_KEY`, ports, rate limits, Mailpit, storage path, worker concurrency, and `BATCH_DISPATCH_CHUNK_SIZE`.

## Migrations

Drizzle SQL under `packages/database/drizzle/`. Apply with `pnpm db:migrate`.

## Scope and trade-offs

| Current implementation         | Trade-off                              |
| ------------------------------ | -------------------------------------- |
| Full async PDF + bulk pipeline | Single shared API key (no OAuth/users) |
| Local FS storage adapter       | Not multi-region object storage        |
| Mailpit optional email         | Not a full notification product        |
| React control plane            | `sessionStorage` key gate only         |
| OpenAPI file                   | No hosted Swagger UI                   |

## Production roadmap

- Replace local storage with S3-compatible backend
- Replace shared API key with service identities / OIDC
- Run workers as a separate autoscaled service
- Add metrics/tracing (OpenTelemetry) beside structured logs
- Harden multi-tenant isolation and audit trails

## Known limitations

- Local filesystem storage is single-host
- Load test isolates enqueue/dispatch from Chromium PDF throughput
- Demo seed creates a new small batch each run (template/draft are reused)
