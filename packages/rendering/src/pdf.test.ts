import { afterAll, describe, expect, it } from 'vitest';
import { FakePdfRenderer, PlaywrightPdfRenderer } from './pdf.js';

describe('FakePdfRenderer', () => {
  it('returns a buffer starting with %PDF', async () => {
    const renderer = new FakePdfRenderer();
    const pdf = await renderer.render('<p>hello</p>');
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });
});

describe('PlaywrightPdfRenderer', () => {
  const renderer = new PlaywrightPdfRenderer();

  afterAll(async () => {
    await renderer.close();
  });

  it('produces a valid PDF beginning with %PDF', async () => {
    const pdf = await renderer.render('<html><body><h1>Certificate</h1></body></html>');
    expect(pdf.byteLength).toBeGreaterThan(100);
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('rejects oversized HTML', async () => {
    await expect(
      renderer.render('x'.repeat(10), { maxHtmlBytes: 5 }),
    ).rejects.toThrow(/maximum size/i);
  });

  it('times out on slow rendering when timeout is very low', async () => {
    await expect(
      renderer.render('<html><body>slow</body></html>', { timeoutMs: 1 }),
    ).rejects.toThrow();
  });
});
