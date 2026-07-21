# Rubric self-assessment

Conservative scoring against the challenge rubric. Evidence points to this repository only.

| Criterion | Implementation | Relevant files | Relevant tests | Expected points | Known limitation |
| --- | --- | --- | --- | --- | --- |
| Template CRUD | Full create/read/update/list/delete with Zod | `apps/api/src/routes/templates.ts`, `services/templates.ts` | `apps/api/src/app.test.ts` | High | — |
| Document CRUD | Draft CRUD with status filters | `apps/api/src/routes/documents.ts` | `apps/api/src/app.test.ts` | High | Patch only allowed on drafts |
| Variable replacement | Safe Handlebars AST + escape | `packages/rendering` | `packages/rendering/src/index.test.ts` | High | Nested paths supported; helpers rejected |
| Non-persistent preview | `POST .../preview` returns HTML only | `apps/api/src/routes/templates.ts` | API integration | High | — |
| BullMQ PDF generation | API enqueues; worker renders | `packages/queue`, `apps/worker/src/generate.ts` | `apps/worker/src/generate.test.ts`, rendering PDF tests | High | Requires Redis + Chromium |
| Bulk without blocking API | One dispatch job + chunked `addBulk` | `apps/api/src/services/batches.ts`, `apps/worker/src/dispatch.ts` | API batch test + `pnpm test:load` | High | Progress counts from item statuses |
| Clean separation | Routes / services / repos / packages | `apps/*`, `packages/*` | — | High | — |
| Zod + HTTP errors | Contracts + `{ error: { code, message, details } }` | `packages/contracts`, `apps/api/src/plugins/error-handler.ts` | API tests | High | — |
| README | Evaluator quick start + architecture | `README.md` | Manual | High | Keep in sync when scripts change |
| Rendering unit tests | Handlebars + Playwright `%PDF` | `packages/rendering/src/*.test.ts` | vitest | High | — |
| CRUD/preview integration | Fastify inject tests | `apps/api/src/app.test.ts` | vitest | High | Needs Postgres test DB |
| Worker retry/failure | Final vs transient failure paths | `apps/worker/src/generate.test.ts` | vitest | High | Full BullMQ retry loop covered partly by unit + manual |
| Single test command | `pnpm test` | root `package.json` | — | High | Load test is separate by design |
| API-key everywhere | Global middleware incl. health | `apps/api/src/plugins/api-key.ts` | API 401 suite | High | — |
| Timing-safe key compare | `timingSafeEqual` | `api-key.ts` | API invalid key test | High | — |
| Escaped variables | Handlebars escape | rendering package | rendering tests | High | — |
| Rate/payload limits | Env-driven Fastify limits | `apps/api/src/env.ts`, routes | — | Medium-High | In-memory fallback if Redis unavailable at boot |
| Mailpit email | Optional after PDF | `apps/worker/src/generate.ts` | Manual + smoke demo | Bonus | Not asserted in default unit suite |
| Status + structured logs | Status endpoint + pino job logs | generation routes, worker | API + manual | Bonus | No Bull Board (intentionally unprotected-avoided) |
| Concurrency / idempotency / shutdown | Claim SQL, job ids, SIGINT close | worker `index.ts`, generate | worker tests + README | Bonus | — |
| Frontend control plane | API key gate + templates/docs/bulk | `apps/web` | Manual browser | Challenge final phase | Demo auth only |
| API artifact | OpenAPI YAML | `docs/openapi.yaml` | — | Required final | No hosted Swagger UI |
| Demo scripts | `demo:seed`, `demo:generate` | `scripts/demo-*.ts` | Manual against running API | Required final | Seed creates a new small batch each run |

## Estimated overall

Backend challenge requirements: **strong / near-complete**.  
Final phase (frontend + evaluator docs + demos): **implemented**.  

Do not treat this table as an official score. It is a factual map for reviewers.
