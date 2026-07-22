import { describe, expect, it } from 'vitest';
import {
  CreateTemplateSchema,
  DispatchBatchJobSchema,
  GenerateCertificateJobSchema,
  HealthResponseSchema,
  PreviewRequestSchema,
} from '../src/index.js';

describe('HealthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    const payload = {
      status: 'ok' as const,
      service: 'api' as const,
      timestamp: new Date().toISOString(),
    };

    expect(HealthResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an invalid status', () => {
    expect(() =>
      HealthResponseSchema.parse({
        status: 'down',
        service: 'api',
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe('queue job schemas', () => {
  it('preserves correlation IDs across generation and batch jobs', () => {
    const correlationId = 'req-42';

    expect(
      GenerateCertificateJobSchema.parse({
        documentId: '00000000-0000-4000-8000-000000000001',
        correlationId,
      }),
    ).toMatchObject({ correlationId });
    expect(
      DispatchBatchJobSchema.parse({
        batchId: '00000000-0000-4000-8000-000000000002',
        correlationId,
      }),
    ).toMatchObject({ correlationId });
    expect(() =>
      GenerateCertificateJobSchema.parse({
        documentId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow();
  });
});

describe('CreateTemplateSchema', () => {
  it('rejects unknown fields', () => {
    expect(() =>
      CreateTemplateSchema.parse({
        name: 'Diploma',
        html: '<p>{{name}}</p>',
        variables: ['name'],
      }),
    ).toThrow();
  });
});

describe('PreviewRequestSchema', () => {
  it('accepts variable payloads', () => {
    expect(
      PreviewRequestSchema.parse({
        variables: { studentName: 'Ada' },
      }),
    ).toEqual({
      variables: { studentName: 'Ada' },
    });
  });
});
