import { describe, expect, it } from 'vitest';
import {
  CreateTemplateSchema,
  HealthResponseSchema,
  PreviewRequestSchema,
} from './index.js';

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
