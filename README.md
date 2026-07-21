# Certificate Generation API

TypeScript monorepo for certificate template management, document drafts, and safe HTML preview.

```text
apps/web  ──▶  apps/api  ──▶  PostgreSQL
                  │
                  ├── Redis (rate limits / future queues)
                  └── packages/rendering (Handlebars)
apps/worker ──▶ Redis / PostgreSQL / Playwright (PDF pipeline ready, not wired to generate yet)
```

## Stack

| Area | Choice |
| --- | --- |
| Apps | `apps/api` (Fastify), `apps/worker` (BullMQ), `apps/web` (Vite scaffold) |
| Packages | `contracts`, `database`, `queue`, `rendering`, `storage` |
| Data | PostgreSQL + Drizzle ORM |
| Templates | Handlebars with AST validation and HTML escaping |
| Auth | Shared `X-API-Key` on every API route |

## Requirements

- Node.js 22+
- pnpm 11+
- Docker Compose (PostgreSQL, Redis, Mailpit) or equivalent local services

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm --filter @certificates/api dev
```

Run the full workspace with `pnpm dev` (API, worker, web scaffold).

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis for rate limiting (and future queues) |
| `API_KEY` | Required value for `X-API-Key` |
| `WEB_ORIGIN` | CORS allowlist for the web origin |
| `BODY_LIMIT_BYTES` | Global JSON body limit (default 1 MiB) |
| `TEMPLATE_BODY_LIMIT_BYTES` | Stricter limit for template write routes |
| `PREVIEW_BODY_LIMIT_BYTES` | Stricter limit for preview |
| `PREVIEW_RATE_LIMIT_MAX` / `PREVIEW_RATE_LIMIT_WINDOW_MS` | Preview rate limit |

## Data model

### `templates`

| Column | Notes |
| --- | --- |
| `id` | UUID PK |
| `name` | Required |
| `description` | Nullable |
| `html` | Handlebars source |
| `variables` | JSONB string array, derived server-side from the template AST |
| `created_at` / `updated_at` | Timestamps |

### `documents`

| Column | Notes |
| --- | --- |
| `id` | UUID PK |
| `template_id` | FK → templates (`ON DELETE RESTRICT`) |
| `variables` | JSONB object |
| `status` | `draft` \| `queued` \| `processing` \| `completed` \| `failed` |
| `output_path` / `error_code` / `error_message` / `generated_at` | Nullable generation metadata |
| `created_at` / `updated_at` | Timestamps |

Documents created via the API start as `draft`. Template delete returns `409` when documents still reference the template.

Document delete is allowed for `draft`, `completed`, and `failed`. `queued` / `processing` return `409`.

## Authentication

Every route requires:

```http
X-API-Key: <API_KEY>
```

Missing or invalid keys return `401` with the standard error envelope. Comparison is constant-time. Keys are never logged.

```bash
curl -s -H "X-API-Key: $API_KEY" http://localhost:3000/health
```

## Error format

```json
{
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "Template not found",
    "details": {}
  }
}
```

Common status codes: `200`, `201`, `204`, `400`, `401`, `404`, `409`, `413`, `422`, `429`, `500`.

## HTTP API

### Health

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness (`X-API-Key` required) |

### Templates

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/templates` | Paginated list (`page`, `pageSize`, optional `search`) |
| `POST` | `/api/templates` | Create (validates HTML, derives `variables`) |
| `GET` | `/api/templates/:templateId` | Fetch one |
| `PATCH` | `/api/templates/:templateId` | Update |
| `DELETE` | `/api/templates/:templateId` | Delete (`409` if referenced) |
| `POST` | `/api/templates/:templateId/preview` | Render HTML without persistence |

### Documents

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/documents` | Paginated list (`templateId`, `status` filters) |
| `POST` | `/api/documents` | Create draft (requires all template variables) |
| `GET` | `/api/documents/:documentId` | Fetch one |
| `PATCH` | `/api/documents/:documentId` | Update draft only |
| `DELETE` | `/api/documents/:documentId` | Delete when allowed |

Clients cannot set `status`, `output_path`, error fields, or `generated_at`.

### Examples

Create a template:

```bash
curl -s -X POST http://localhost:3000/api/templates \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diploma",
    "description": "Course completion",
    "html": "<h1>{{studentName}}</h1><p>{{course.title}}</p>"
  }'
```

Preview (JSON body with escaped HTML in `html`):

```bash
curl -s -X POST http://localhost:3000/api/templates/$TEMPLATE_ID/preview \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "studentName": "Ada Lovelace",
      "course": { "title": "Distributed Systems" }
    }
  }'
```

Create a draft document:

```bash
curl -s -X POST http://localhost:3000/api/documents \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "'"$TEMPLATE_ID"'",
    "variables": {
      "studentName": "Ada Lovelace",
      "course": { "title": "Distributed Systems" }
    }
  }'
```

## Rendering rules

- Placeholders are extracted from the Handlebars AST (not regex-only).
- Only simple escaped paths are allowed (`{{name}}`, `{{course.title}}`).
- `{{{...}}}`, `{{& ...}}`, helpers, blocks, and partials are rejected.
- Required placeholders must be present; extra variables are ignored.
- Interpolation uses Handlebars HTML escaping (never `noEscape`).
- Value handling: `undefined` → missing error; `null` → empty string; strings/numbers/booleans rendered as-is (escaped); nested objects supported for path segments; array/object leaves are JSON-stringified then escaped.
- Preview does not create documents, enqueue jobs, or produce PDFs.
- Preview is rate-limited (Redis-backed when Redis is available; otherwise in-memory per process).

## Limits

| Limit | Default |
| --- | --- |
| Template name | 200 chars |
| Template description | 2,000 chars |
| Template HTML | 100,000 chars |
| Unique placeholders | 50 |
| Document variables JSON | 32 KiB |
| Page size | 1–100 (default 20) |
| Preview rate limit | 30 / 60s |

## Scripts

```bash
pnpm db:generate
pnpm db:migrate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Integration tests use PostgreSQL database `certificates_test` by default (`TEST_DATABASE_URL` overrides).

## Local URLs

| Service | URL |
| --- | --- |
| API | http://localhost:3000 |
| Web scaffold | http://localhost:5173 |
| Mailpit | http://localhost:8025 |
