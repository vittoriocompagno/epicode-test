import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Env } from './env.js';

const testEnv: Env = {
  NODE_ENV: 'test',
  API_PORT: 3000,
  WEB_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/certificates',
  REDIS_URL: 'redis://localhost:6379',
  API_KEY: 'test-api-key',
  BODY_LIMIT_BYTES: 1_048_576,
};

describe('API smoke', () => {
  const appPromise = buildApp(testEnv);

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('responds to /health', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'api',
    });
  });
});
