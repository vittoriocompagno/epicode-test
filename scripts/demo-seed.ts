#!/usr/bin/env tsx
/**
 * Idempotent demo seed: upserts a known certificate template, one draft document,
 * and a tiny batch. Safe to re-run; does not wipe unrelated data.
 */
import { loadEnv } from '../apps/api/src/env.ts';

const DEMO_TEMPLATE_NAME = 'Demo Certificate';
const DEMO_MARKER = '[demo-seed]';

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Georgia, serif; margin: 0; padding: 48px; color: #1a2332; background: #f7f4ef; }
    .frame { border: 2px solid #1a2332; padding: 48px; text-align: center; }
    h1 { font-size: 36px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 12px; }
    .sub { color: #5a6577; margin-bottom: 32px; }
    .name { font-size: 42px; margin: 24px 0; }
    .meta { margin-top: 40px; font-size: 14px; color: #5a6577; }
  </style>
</head>
<body>
  <div class="frame">
    <h1>Certificate of Completion</h1>
    <p class="sub">${DEMO_MARKER}</p>
    <p>This certifies that</p>
    <p class="name">{{studentName}}</p>
    <p>has successfully completed</p>
    <p><strong>{{courseName}}</strong></p>
    <p class="meta">Issued {{issueDate}}</p>
  </div>
</body>
</html>`;

async function main(): Promise<void> {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  });

  const baseUrl = process.env.DEMO_API_BASE_URL ?? `http://localhost:${env.API_PORT}`;
  const apiKey = env.API_KEY;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
  };

  const health = await fetch(`${baseUrl}/health`, { headers: { 'x-api-key': apiKey } });
  if (!health.ok) {
    throw new Error(`API not reachable at ${baseUrl} (${health.status}). Start pnpm --filter @certificates/api dev first.`);
  }

  const templates = await fetchJson<{ items: Array<{ id: string; name: string }> }>(
    `${baseUrl}/api/templates?pageSize=100&search=Demo`,
    { headers: { 'x-api-key': apiKey } },
  );

  let templateId = templates.items.find((item) => item.name === DEMO_TEMPLATE_NAME)?.id;
  if (!templateId) {
    const created = await fetchJson<{ id: string }>(`${baseUrl}/api/templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: DEMO_TEMPLATE_NAME,
        description: 'Seeded demo certificate template',
        html: DEFAULT_HTML,
      }),
    });
    templateId = created.id;
    console.log('Created demo template', templateId);
  } else {
    await fetchJson(`${baseUrl}/api/templates/${templateId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: 'Seeded demo certificate template',
        html: DEFAULT_HTML,
      }),
    });
    console.log('Updated demo template', templateId);
  }

  const documents = await fetchJson<{ items: Array<{ id: string; status: string; variables: Record<string, unknown> }> }>(
    `${baseUrl}/api/documents?pageSize=100&templateId=${templateId}`,
    { headers: { 'x-api-key': apiKey } },
  );

  const existingDraft = documents.items.find(
    (doc) => doc.status === 'draft' && doc.variables?.seed === 'demo',
  );

  let documentId = existingDraft?.id;
  if (!documentId) {
    const created = await fetchJson<{ id: string }>(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        templateId,
        variables: {
          seed: 'demo',
          studentName: 'Ada Lovelace',
          courseName: 'Analytical Engine Fundamentals',
          issueDate: '2026-07-21',
        },
        emailTo: 'ada@example.com',
      }),
    });
    documentId = created.id;
    console.log('Created demo draft document', documentId);
  } else {
    console.log('Reusing demo draft document', documentId);
  }

  const batch = await fetchJson<{ batchId: string; total: number }>(`${baseUrl}/api/batches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      templateId,
      emailTo: 'cohort@example.com',
      items: [
        {
          variables: {
            studentName: 'Grace Hopper',
            courseName: 'Compiler Design',
            issueDate: '2026-07-21',
          },
        },
        {
          variables: {
            studentName: 'Alan Turing',
            courseName: 'Computability',
            issueDate: '2026-07-21',
          },
        },
      ],
    }),
  });

  console.log(
    JSON.stringify(
      {
        templateId,
        documentId,
        batchId: batch.batchId,
        batchTotal: batch.total,
        note: 'Idempotent for template/draft; creates a new small batch each run',
      },
      null,
      2,
    ),
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body as T;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
