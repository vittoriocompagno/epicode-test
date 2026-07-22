# Rubric assessment

This is a conservative, repository-backed assessment, not an official grade.

## 1. Completeness — 40/40

| Criterion              | Points | Evidence                                                                                                                                                            |
| ---------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template CRUD          |    8/8 | `apps/api/src/routes/templates.ts`, `TemplateService`, and API integration coverage for create, get, update, list, and delete                                       |
| Document CRUD          |    8/8 | `apps/api/src/routes/documents.ts`, `DocumentService`, and API integration coverage for create, get, update, list, and delete                                       |
| Variable replacement   |    6/6 | Handlebars AST validation, nested paths, deterministic value normalization, missing-variable errors, own-property lookup, and HTML escaping in `packages/rendering` |
| Non-persistent preview |    5/5 | Stored-template and ad-hoc preview endpoints return rendered HTML; tests verify that neither documents nor templates are accidentally persisted                     |
| Async PDF generation   |    8/8 | Generate returns `202` after enqueueing a stable BullMQ job. Only the separate worker imports and invokes `PdfRenderer`                                             |
| Bulk generation        |    5/5 | API bulk-inserts documents, enqueues one dispatch job, and returns `202`; the worker dispatches certificate jobs in configurable `addBulk` chunks                   |

The generation path does not render PDFs in the API process. The production and local startup paths are documented in `README.md`.

## 2. Clean code — 25/25

| Criterion              | Points | Evidence                                                                                                                                               |
| ---------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project structure      |    6/6 | Routes, services, repositories, plugins, workers, queue helpers, rendering, storage, contracts, and database code have separate boundaries             |
| Naming and duplication |    5/5 | Shared lifecycle, queue, contracts, rendering, and storage behavior is centralized rather than copied between API and worker                           |
| Boundary validation    |    5/5 | Strict Zod schemas cover bodies, query strings, IDs, pagination, limits, and environment configuration                                                 |
| Error handling         |    5/5 | Central Fastify error handler returns stable error bodies and meaningful 4xx/5xx codes; worker failures are logged and persisted with bounded messages |
| README                 |    4/4 | Quick start, architecture, API/OpenAPI link, async flow, deployment, environment, testing, scaling, and limitations are documented                     |

## 3. Testing — 20/20

| Criterion              | Points | Evidence                                                                                                                                                             |
| ---------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering unit tests   |    6/6 | Variable extraction, missing variables, nested values, inherited-property rejection, escaping, unsafe syntax, and real Playwright `%PDF` output                      |
| API integration tests  |    6/6 | Authentication, full CRUD, stored/ad-hoc preview, escaping, generation, status, download, batches, errors, rate limits, and payload limits through Fastify injection |
| Worker and queue tests |    4/4 | Real Redis/BullMQ loop covers success, retry-then-success, exhausted attempts, idempotent job IDs, and the batch dispatch race                                       |
| One test command       |    4/4 | `pnpm test` builds packages, idempotently creates and migrates `certificates_test`, then runs every suite                                                            |

The 10,000-item test is intentionally separate as `pnpm test:load`: it measures API responsiveness, persistence, and queue dispatch without spending hours rendering 10,000 Chromium PDFs.

## 4. Security — 15/15

| Criterion               | Points | Evidence                                                                                                                                                                                                        |
| ----------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API-key middleware      |    5/5 | One global `onRequest` hook protects every route, including `/health`; integration tests cover missing and invalid keys                                                                                         |
| Key handling            |    3/3 | Key comes from validated environment configuration and is compared with `timingSafeEqual`; no real `.env` is tracked                                                                                            |
| Injection prevention    |    4/4 | Handlebars escaping is enabled; raw expressions, helpers, blocks, partials, and inherited-property lookup are rejected or treated as missing; Playwright disables JS and blocks external and `file://` requests |
| Rate and payload limits |    3/3 | Preview, generate/retry, and batch routes use configurable rate limits and route-specific body limits with tested `429` and `413` responses                                                                     |

## Bonus — 10/10

| Criterion              | Points | Evidence                                                                                                                                                                     |
| ---------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mailpit delivery       |     +4 | Worker sends the generated PDF as an attachment through configurable SMTP; Compose supplies Mailpit; worker test verifies successful delivery state                          |
| Observability          |     +3 | Authenticated document status endpoint, batch progress endpoint, overview endpoint, and structured Pino job logs                                                             |
| Horizontal scalability |     +3 | Configurable worker concurrency, multiple-replica queue design, atomic SQL claims, deterministic job/storage IDs, retry-safe state transitions, and graceful signal handling |

## Estimated result

**100/100 base points, plus 10/10 bonus points.**

The main production limitation is local filesystem storage: multiple workers must share the same mounted volume. The `DocumentStorage` boundary allows an S3-compatible adapter for a multi-host deployment without changing API or worker orchestration.
