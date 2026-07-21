#!/usr/bin/env tsx
/**
 * Public-API smoke demo: create template → document → generate → poll → download PDF.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from '../apps/api/src/env.ts';

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
    throw new Error(`API not reachable at ${baseUrl}. Start API + worker first.`);
  }

  const template = await fetchJson<{ id: string }>(`${baseUrl}/api/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Smoke ${new Date().toISOString()}`,
      html: '<h1>{{studentName}}</h1><p>{{courseName}}</p>',
    }),
  });

  const document = await fetchJson<{ id: string }>(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      templateId: template.id,
      variables: { studentName: 'Smoke Tester', courseName: 'Certificate Pipeline' },
      emailTo: 'smoke@example.com',
    }),
  });

  const accepted = await fetchJson<{ status: string; jobId: string }>(
    `${baseUrl}/api/documents/${document.id}/generate`,
    { method: 'POST', headers: { 'x-api-key': apiKey } },
  );
  console.log('generate', accepted);

  let status = accepted.status;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await fetchJson<{
      status: string;
      error: { code: string; message: string } | null;
    }>(`${baseUrl}/api/documents/${document.id}/status`, {
      headers: { 'x-api-key': apiKey },
    });
    status = current.status;
    console.log(`status poll ${attempt + 1}:`, status);
    if (status === 'completed' || status === 'failed') {
      if (status === 'failed') {
        throw new Error(`Generation failed: ${JSON.stringify(current.error)}`);
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (status !== 'completed') {
    throw new Error('Timed out waiting for completed status');
  }

  const pdfResponse = await fetch(`${baseUrl}/api/documents/${document.id}/download`, {
    headers: { 'x-api-key': apiKey },
  });
  if (!pdfResponse.ok) {
    throw new Error(`Download failed: ${pdfResponse.status}`);
  }
  const buffer = Buffer.from(await pdfResponse.arrayBuffer());
  if (buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
    throw new Error('Downloaded file does not start with %PDF');
  }

  const outPath = path.resolve('data/demo-smoke.pdf');
  await writeFile(outPath, buffer);
  console.log(
    JSON.stringify(
      {
        templateId: template.id,
        documentId: document.id,
        pdfBytes: buffer.length,
        savedTo: outPath,
        startsWithPdf: true,
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
