# Certificate Generation — Technical Foundation

pnpm workspace monorepo for a certificate generation platform. This phase establishes project structure, tooling, shared packages, and runnable services. Certificate business logic is intentionally deferred.

## Architecture overview

```text
apps/web  ──HTTP──▶  apps/api  ──enqueue──▶  Redis/BullMQ  ──▶  apps/worker
                         │                                         │
                         └──────────── PostgreSQL ◀────────────────┘
```

- **web** — React + Vite operator console (placeholder navigation + API health check)
- **api** — Fastify HTTP API with env validation, CORS, Pino logging, API-key plugin ready
- **worker** — BullMQ worker with Redis/Postgres connectivity and Playwright Chromium lifecycle
- **packages/** — shared contracts, database, queue, rendering placeholders, and storage skeleton

## Repository structure

```text
.
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── contracts/
│   ├── database/
│   ├── queue/
│   ├── rendering/
│   └── storage/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

## Requirements

- Node.js 22+
- pnpm 11+
- Docker + Docker Compose (recommended for PostgreSQL, Redis, Mailpit)

If Docker is unavailable, equivalent local services on the same ports also work.

## Installation

```bash
cp .env.example .env
pnpm install
```

`pnpm install` also downloads Playwright Chromium for the worker via `apps/worker` `postinstall`.

## Environment setup

Copy `.env.example` to `.env`. Key values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_PORT` | `5173` | Vite dev server |
| `API_PORT` | `3000` | Fastify API |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS origin |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Browser API base URL |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/certificates` | Postgres |
| `REDIS_URL` | `redis://localhost:6379` | Redis / BullMQ |
| `API_KEY` | `development-api-key` | Future protected routes (`x-api-key`) |
| `WORKER_CONCURRENCY` | `2` | BullMQ concurrency |
| `MAIL_HOST` / `MAIL_PORT` | `localhost` / `1025` | Mailpit SMTP |
| `LOCAL_STORAGE_PATH` | `./data/documents` | Local document storage root |

Never commit real credentials.

## Starting infrastructure

```bash
docker compose up -d
```

Services:

| Service | Ports |
| --- | --- |
| PostgreSQL | `5432` |
| Redis | `6379` |
| Mailpit SMTP | `1025` |
| Mailpit UI | `8025` |

## Running migrations

```bash
pnpm db:generate   # generate SQL from Drizzle schema
pnpm db:migrate    # apply migrations
pnpm db:studio     # optional Drizzle Studio
```

## Starting all applications

```bash
pnpm dev
```

Starts **web**, **api**, and **worker** concurrently.

## Running individual applications

```bash
pnpm --filter @certificates/web dev
pnpm --filter @certificates/api dev
pnpm --filter @certificates/worker dev
```

## Testing

```bash
pnpm test
```

Includes:

- contracts schema unit test
- API `/health` smoke test
- queue/worker configuration tests

## Linting and type checking

```bash
pnpm lint
pnpm typecheck
pnpm format
pnpm build
```

## Local service URLs

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API health | http://localhost:3000/health |
| Mailpit UI | http://localhost:8025 |

## Current scope and deferred features

**Included now**

- Monorepo tooling (TypeScript, ESLint, Prettier, Vitest)
- Shared packages and workspace wiring
- Runnable web/API/worker foundations
- Docker Compose infrastructure
- Minimal Drizzle migration bootstrap

**Deferred to later phases**

- Template / document CRUD
- Certificate rendering (Handlebars + Playwright PDF)
- Real BullMQ certificate job processing
- API-key enforcement on business routes
- Bulk generation flows
- Drag-and-drop template editor
- S3/MinIO storage adapters
