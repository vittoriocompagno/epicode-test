import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import type { Env } from './env.js';

const API_KEY = 'test-api-key';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const RATE_LIMIT_NAMESPACE = 'certificates-api-rate-limit-';

const testEnv: Env = {
  NODE_ENV: 'test',
  API_PORT: 3000,
  WEB_ORIGIN: 'http://localhost:5173',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/certificates_test',
  REDIS_URL,
  API_KEY,
  LOCAL_STORAGE_PATH: './data/test-documents',
  BODY_LIMIT_BYTES: 1_048_576,
  TEMPLATE_BODY_LIMIT_BYTES: 131_072,
  PREVIEW_BODY_LIMIT_BYTES: 65_536,
  BATCH_BODY_LIMIT_BYTES: 32_000_000,
  PREVIEW_RATE_LIMIT_MAX: 1000,
  PREVIEW_RATE_LIMIT_WINDOW_MS: 60_000,
  GENERATE_RATE_LIMIT_MAX: 1000,
  GENERATE_RATE_LIMIT_WINDOW_MS: 60_000,
  BATCH_RATE_LIMIT_MAX: 1000,
  BATCH_RATE_LIMIT_WINDOW_MS: 60_000,
};

async function flushRateLimitKeys(): Promise<void> {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    const keys = await redis.keys(`${RATE_LIMIT_NAMESPACE}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}

function authHeaders(extra: Record<string, string> = {}) {
  return {
    'x-api-key': API_KEY,
    ...extra,
  };
}

function jsonHeaders(extra: Record<string, string> = {}) {
  return authHeaders({
    'content-type': 'application/json',
    ...extra,
  });
}

describe('API integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testEnv);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.db.sql`truncate table batch_items, generation_batches, documents, templates restart identity cascade`;
  });

  it('rejects missing API key with 401 on protected endpoints', async () => {
    const paths = [
      '/health',
      '/api/overview',
      '/api/templates',
      '/api/documents',
      '/api/batches',
    ];
    for (const url of paths) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { code: 'UNAUTHORIZED' },
      });
    }
  });

  it('rejects invalid API key with 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('accepts a valid API key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'api' });
  });

  it('supports template create/read/update/list/delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Diploma',
        description: 'Basic diploma',
        html: '<h1>{{studentName}}</h1><p>{{course.title}}</p>',
      },
    });
    expect(created.statusCode).toBe(201);
    const template = created.json();
    expect(template.variables).toEqual(['course.title', 'studentName']);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/templates?search=Dip',
      headers: authHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().total).toBe(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/templates/${template.id}`,
      headers: jsonHeaders(),
      payload: {
        name: 'Diploma Updated',
        html: '<p>{{studentName}}</p>',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().variables).toEqual(['studentName']);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/templates/${template.id}`,
      headers: authHeaders(),
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('rejects invalid templates', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Bad',
        html: '{{{unsafe}}}',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_TEMPLATE' },
    });
  });

  it('supports document CRUD and rejects missing variables', async () => {
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Doc Template',
        html: 'Hello {{studentName}}',
      },
    });
    const template = templateResponse.json();

    const missing = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: jsonHeaders(),
      payload: {
        templateId: template.id,
        variables: {},
      },
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toMatchObject({
      error: { code: 'MISSING_VARIABLES' },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: jsonHeaders(),
      payload: {
        templateId: template.id,
        variables: { studentName: 'Ada' },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe('draft');

    const documentId = created.json().id;
    const listed = await app.inject({
      method: 'GET',
      url: `/api/documents?templateId=${template.id}&status=draft`,
      headers: authHeaders(),
    });
    expect(listed.json().total).toBe(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/documents/${documentId}`,
      headers: jsonHeaders(),
      payload: {
        variables: { studentName: 'Grace' },
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().variables.studentName).toBe('Grace');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/documents/${documentId}`,
      headers: authHeaders(),
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('returns 404 for missing template and 409 when deleting referenced template', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/api/templates/00000000-0000-4000-8000-000000000000',
      headers: authHeaders(),
    });
    expect(missing.statusCode).toBe(404);

    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Referenced',
        html: '{{name}}',
      },
    });
    const template = templateResponse.json();

    await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: jsonHeaders(),
      payload: {
        templateId: template.id,
        variables: { name: 'Ada' },
      },
    });

    const conflict = await app.inject({
      method: 'DELETE',
      url: `/api/templates/${template.id}`,
      headers: authHeaders(),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: 'TEMPLATE_IN_USE' },
    });
  });

  it('previews HTML without persisting a document and escapes malicious content', async () => {
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Preview',
        html: '<p>{{studentName}}</p>',
      },
    });
    const template = templateResponse.json();

    const preview = await app.inject({
      method: 'POST',
      url: `/api/templates/${template.id}/preview`,
      headers: jsonHeaders(),
      payload: {
        variables: { studentName: '<img src=x onerror=alert(1)>' },
      },
    });
    expect(preview.statusCode).toBe(200);
    const html = preview.json().html as string;
    expect(html).toContain('&lt;img');
    expect(html).toContain('&#x3D;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror=alert');

    const docs = await app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: authHeaders(),
    });
    expect(docs.json().total).toBe(0);
  });

  it('requires API keys on generation and batch endpoints', async () => {
    const paths = [
      { method: 'POST' as const, url: '/api/documents/00000000-0000-4000-8000-000000000001/generate' },
      { method: 'POST' as const, url: '/api/documents/00000000-0000-4000-8000-000000000001/retry' },
      { method: 'GET' as const, url: '/api/documents/00000000-0000-4000-8000-000000000001/status' },
      { method: 'GET' as const, url: '/api/documents/00000000-0000-4000-8000-000000000001/download' },
      { method: 'POST' as const, url: '/api/batches' },
      { method: 'GET' as const, url: '/api/batches/00000000-0000-4000-8000-000000000001' },
    ];

    for (const path of paths) {
      const response = await app.inject({
        method: path.method,
        url: path.url,
        headers: path.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        payload: path.method === 'POST' && path.url === '/api/batches' ? { templateId: '00000000-0000-4000-8000-000000000001', items: [] } : undefined,
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('enqueues generation and rejects invalid retries', async () => {
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Generate',
        html: '<p>{{name}}</p>',
      },
    });
    const template = templateResponse.json();

    const documentResponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: jsonHeaders(),
      payload: {
        templateId: template.id,
        variables: { name: 'Ada' },
      },
    });
    const document = documentResponse.json();

    const generated = await app.inject({
      method: 'POST',
      url: `/api/documents/${document.id}/generate`,
      headers: authHeaders(),
    });
    expect(generated.statusCode).toBe(202);
    expect(generated.json()).toMatchObject({
      documentId: document.id,
      status: 'queued',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/documents/${document.id}/status`,
      headers: authHeaders(),
    });
    expect(status.json().status).toBe('queued');

    const retryDraft = await app.inject({
      method: 'POST',
      url: `/api/documents/${document.id}/retry`,
      headers: authHeaders(),
    });
    expect(retryDraft.statusCode).toBe(409);
  });

  it('creates a batch and returns progress metadata', async () => {
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Batch',
        html: '<p>{{name}}</p>',
      },
    });
    const template = templateResponse.json();

    const batchResponse = await app.inject({
      method: 'POST',
      url: '/api/batches',
      headers: jsonHeaders(),
      payload: {
        templateId: template.id,
        items: [{ variables: { name: 'Ada' } }, { variables: { name: 'Grace' } }],
      },
    });
    expect(batchResponse.statusCode).toBe(202);
    expect(batchResponse.json()).toMatchObject({
      status: 'queued',
      total: 2,
    });

    const progress = await app.inject({
      method: 'GET',
      url: `/api/batches/${batchResponse.json().batchId}`,
      headers: authHeaders(),
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().total).toBe(2);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/batches',
      headers: authHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().total).toBe(1);

    const overview = await app.inject({
      method: 'GET',
      url: '/api/overview',
      headers: authHeaders(),
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      api: { status: 'ok' },
      templates: 1,
      documentsByStatus: { draft: 2 },
    });
  });
});

describe('API rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await flushRateLimitKeys();
    app = await buildApp({
      ...testEnv,
      PREVIEW_RATE_LIMIT_MAX: 2,
      PREVIEW_RATE_LIMIT_WINDOW_MS: 60_000,
      GENERATE_RATE_LIMIT_MAX: 2,
      GENERATE_RATE_LIMIT_WINDOW_MS: 60_000,
    });
  });

  afterAll(async () => {
    await app.close();
    await flushRateLimitKeys();
  });

  beforeEach(async () => {
    await flushRateLimitKeys();
    await app.db.sql`truncate table batch_items, generation_batches, documents, templates restart identity cascade`;
  });

  it('returns 429 when preview exceeds the rate limit', async () => {
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Rate limited preview',
        html: '<p>{{studentName}}</p>',
      },
    });
    expect(templateResponse.statusCode).toBe(201);
    const template = templateResponse.json();

    const payload = {
      variables: { studentName: 'Ada' },
    };

    const first = await app.inject({
      method: 'POST',
      url: `/api/templates/${template.id}/preview`,
      headers: jsonHeaders(),
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/templates/${template.id}/preview`,
      headers: jsonHeaders(),
      payload,
    });
    const third = await app.inject({
      method: 'POST',
      url: `/api/templates/${template.id}/preview`,
      headers: jsonHeaders(),
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toMatchObject({
      error: { code: 'RATE_LIMIT_EXCEEDED' },
    });
  });

  it('returns 429 when generate exceeds the rate limit', async () => {
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: jsonHeaders(),
      payload: {
        name: 'Rate limited generate',
        html: '<p>{{name}}</p>',
      },
    });
    const template = templateResponse.json();

    const documentResponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: jsonHeaders(),
      payload: {
        templateId: template.id,
        variables: { name: 'Ada' },
      },
    });
    const document = documentResponse.json();

    const first = await app.inject({
      method: 'POST',
      url: `/api/documents/${document.id}/generate`,
      headers: authHeaders(),
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/documents/${document.id}/generate`,
      headers: authHeaders(),
    });
    const third = await app.inject({
      method: 'POST',
      url: `/api/documents/${document.id}/generate`,
      headers: authHeaders(),
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toMatchObject({
      error: { code: 'RATE_LIMIT_EXCEEDED' },
    });
  });
});
