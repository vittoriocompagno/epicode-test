import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { Env } from './env.js';

const API_KEY = 'test-api-key';

const testEnv: Env = {
  NODE_ENV: 'test',
  API_PORT: 3000,
  WEB_ORIGIN: 'http://localhost:5173',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/certificates_test',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  API_KEY,
  BODY_LIMIT_BYTES: 1_048_576,
  TEMPLATE_BODY_LIMIT_BYTES: 131_072,
  PREVIEW_BODY_LIMIT_BYTES: 65_536,
  PREVIEW_RATE_LIMIT_MAX: 1000,
  PREVIEW_RATE_LIMIT_WINDOW_MS: 60_000,
};

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
    await app.db.sql`truncate table documents, templates restart identity cascade`;
  });

  it('rejects missing API key with 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
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
});
