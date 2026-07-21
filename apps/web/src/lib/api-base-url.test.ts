import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './api-base-url.js';

describe('resolveApiBaseUrl', () => {
  it('uses the current origin when no API URL is configured', () => {
    expect(resolveApiBaseUrl(undefined, 'https://certificates.example.com')).toBe(
      'https://certificates.example.com',
    );
  });

  it('preserves an explicitly configured API URL', () => {
    expect(resolveApiBaseUrl('http://localhost:3000', 'https://certificates.example.com')).toBe(
      'http://localhost:3000',
    );
  });
});
