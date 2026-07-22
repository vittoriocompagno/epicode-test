# API reference

The Certificate Generation API manages reusable HTML templates, certificate documents, asynchronous PDF generation, and bulk generation batches.

Machine-readable contract: [`openapi.yaml`](openapi.yaml).

## Base URLs

| Environment | URL                                |
| ----------- | ---------------------------------- |
| Production  | `https://certificates.compagno.cc` |
| Local       | `http://localhost:3000`            |

## Authentication

Every request, including `/health`, requires an API key in the `X-API-Key` header.

```bash
export CERTIFICATES_API_KEY='<key-shared-separately>'

curl --fail \
  --header "X-API-Key: $CERTIFICATES_API_KEY" \
  https://certificates.compagno.cc/health
```

Missing and invalid keys return `401`:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Valid X-API-Key header is required",
    "details": {}
  }
}
```

JSON requests must send `Content-Type: application/json`.

## Error format

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "MISSING_VARIABLES",
    "message": "Document is missing required variables",
    "details": {
      "missing": ["student.name"]
    }
  }
}
```

Common status codes:

| Status | Meaning                                                           |
| ------ | ----------------------------------------------------------------- |
| `400`  | Invalid identifier, template, or request syntax                   |
| `401`  | Missing or invalid API key                                        |
| `404`  | Resource not found                                                |
| `409`  | Operation is not valid for the resource's current state           |
| `413`  | Request body exceeds the configured limit                         |
| `422`  | Valid request shape, but missing variables or invalid batch items |
| `429`  | Rate limit exceeded                                               |
| `500`  | Unexpected server error                                           |

## Templates

Templates contain HTML and Handlebars expressions such as `{{student.name}}`. Values are HTML-escaped during rendering. Triple braces, helpers, partials, comments, and other unsafe constructs are rejected.

### List templates

```http
GET /api/templates?page=1&pageSize=20&search=certificate
```

Returns a paginated object with `items`, `page`, `pageSize`, `total`, and `totalPages`.

### Create a template

```http
POST /api/templates
```

```json
{
  "name": "Course Certificate",
  "description": "Certificate issued after course completion",
  "html": "<h1>{{student.name}}</h1><p>{{course.title}}</p><p>{{completionDate}}</p>"
}
```

Returns `201` and the created template. The `variables` field is derived from the HTML:

```json
{
  "id": "6fd9575c-5fa7-4ae8-93d0-76c63d6d5818",
  "name": "Course Certificate",
  "description": "Certificate issued after course completion",
  "html": "<h1>{{student.name}}</h1><p>{{course.title}}</p><p>{{completionDate}}</p>",
  "variables": ["completionDate", "course.title", "student.name"],
  "createdAt": "2026-07-22T10:00:00.000Z",
  "updatedAt": "2026-07-22T10:00:00.000Z"
}
```

### Read, update, or delete a template

```http
GET    /api/templates/{templateId}
PATCH  /api/templates/{templateId}
DELETE /api/templates/{templateId}
```

`PATCH` accepts one or more of `name`, `description`, and `html`. `DELETE` returns `204`. A template referenced by documents cannot be deleted and returns `409`.

### Preview without persistence

Preview a stored template:

```http
POST /api/templates/{templateId}/preview
```

```json
{
  "variables": {
    "student": { "name": "Ada Lovelace" },
    "course": { "title": "Distributed Systems" },
    "completionDate": "22 July 2026"
  }
}
```

Preview ad-hoc HTML without creating a template:

```http
POST /api/templates/preview
```

```json
{
  "html": "<h1>{{student.name}}</h1>",
  "variables": {
    "student": { "name": "Ada Lovelace" }
  }
}
```

Both endpoints return rendered HTML and the detected variable names:

```json
{
  "html": "<h1>Ada Lovelace</h1>",
  "variables": ["student.name"]
}
```

Preview never creates a template or document.

## Documents

A document combines one stored template with recipient-specific variables. New documents start in `draft` state.

### List documents

```http
GET /api/documents?page=1&pageSize=20&templateId={templateId}&status=draft
```

`templateId` and `status` are optional. Valid statuses are `draft`, `queued`, `processing`, `completed`, and `failed`.

### Create a document

```http
POST /api/documents
```

```json
{
  "templateId": "6fd9575c-5fa7-4ae8-93d0-76c63d6d5818",
  "variables": {
    "student": { "name": "Ada Lovelace" },
    "course": { "title": "Distributed Systems" },
    "completionDate": "22 July 2026"
  },
  "emailTo": "ada@example.com"
}
```

`emailTo` is optional. When supplied, the worker sends the completed PDF as an attachment.

### Read, update, or delete a document

```http
GET    /api/documents/{documentId}
PATCH  /api/documents/{documentId}
DELETE /api/documents/{documentId}
```

Only `draft` documents can be updated. Documents in `draft`, `completed`, or `failed` state can be deleted; queued and processing documents cannot. `PATCH` accepts `templateId` and/or `variables`.

### Generate a PDF

```http
POST /api/documents/{documentId}/generate
```

The API persists the queued state, enqueues a BullMQ job, and returns `202` without rendering inline:

```json
{
  "documentId": "7c7d45c1-7a99-44fa-aa9e-71e07e55c662",
  "status": "queued",
  "jobId": "generate-7c7d45c1-7a99-44fa-aa9e-71e07e55c662"
}
```

Repeated generation requests are idempotent. Completed documents are returned as completed; duplicate jobs do not generate another file.

### Poll generation status

```http
GET /api/documents/{documentId}/status
```

```json
{
  "documentId": "7c7d45c1-7a99-44fa-aa9e-71e07e55c662",
  "status": "completed",
  "attempts": 1,
  "createdAt": "2026-07-22T10:00:00.000Z",
  "updatedAt": "2026-07-22T10:00:03.000Z",
  "generatedAt": "2026-07-22T10:00:03.000Z",
  "error": null,
  "emailStatus": "sent"
}
```

Poll until `status` is `completed` or `failed`.

### Retry a failed document

```http
POST /api/documents/{documentId}/retry
```

Returns `202` when the failed document is queued again. Documents in any other state return `409`.

### Download a PDF

```http
GET /api/documents/{documentId}/download
```

Returns `application/pdf` after generation completes. Requests made before the document is ready return `409 DOCUMENT_NOT_READY`.

```bash
curl --fail \
  --header "X-API-Key: $CERTIFICATES_API_KEY" \
  --output certificate.pdf \
  "https://certificates.compagno.cc/api/documents/$DOCUMENT_ID/download"
```

## Bulk generation

### Create a batch

```http
POST /api/batches
```

```json
{
  "templateId": "6fd9575c-5fa7-4ae8-93d0-76c63d6d5818",
  "items": [
    {
      "variables": {
        "student": { "name": "Ada Lovelace" },
        "course": { "title": "Distributed Systems" },
        "completionDate": "22 July 2026"
      },
      "emailTo": "ada@example.com"
    },
    {
      "variables": {
        "student": { "name": "Grace Hopper" },
        "course": { "title": "Compilers" },
        "completionDate": "22 July 2026"
      }
    }
  ]
}
```

A batch accepts between 1 and 10,000 items. A top-level `emailTo` can provide one fallback address for every item that does not define its own address.

The API inserts the batch and documents in bulk, enqueues one dispatcher job, and returns `202`:

```json
{
  "batchId": "641851ec-537a-4da9-87d3-79d7252ce88e",
  "status": "queued",
  "total": 2
}
```

### List or poll batches

```http
GET /api/batches?page=1&pageSize=20
GET /api/batches/{batchId}
```

```json
{
  "id": "641851ec-537a-4da9-87d3-79d7252ce88e",
  "status": "processing",
  "total": 2,
  "queued": 1,
  "processing": 0,
  "completed": 1,
  "failed": 0,
  "pending": 0,
  "createdAt": "2026-07-22T10:00:00.000Z",
  "completedAt": null
}
```

Batch status is derived from its documents. Poll until the batch is `completed` or `failed`.

## Overview and health

```http
GET /health
GET /api/overview
```

`/health` is a liveness check and does not query PostgreSQL. `/api/overview` returns template counts, document counts by status, and recent document and batch activity.

## Limits

| Limit                       | Default            |
| --------------------------- | ------------------ |
| General request body        | 1 MiB              |
| Template create/update body | 128 KiB            |
| Preview body                | 64 KiB             |
| Batch body                  | 32,000,000 bytes   |
| Template HTML               | 100,000 characters |
| Template variables          | 50                 |
| Document variables JSON     | 32 KiB             |
| Batch size                  | 10,000 items       |
| Preview requests            | 30 per minute      |
| Generate and retry requests | 60 per minute      |
| Batch requests              | 10 per minute      |

Rate limits are configurable through environment variables. List endpoints accept `pageSize` values from 1 to 100.
