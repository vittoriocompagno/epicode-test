import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function packagePlaywrightVersion(relativePath: string): string {
  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, relativePath), 'utf8'),
  ) as { dependencies?: { playwright?: string } };
  const version = packageJson.dependencies?.playwright;
  if (!version) {
    throw new Error(`${relativePath} does not declare Playwright`);
  }
  return version;
}

describe('worker container Playwright version', () => {
  it('pins one version across packages and the Docker browser image', () => {
    const workerVersion = packagePlaywrightVersion('apps/worker/package.json');
    const renderingVersion = packagePlaywrightVersion('packages/rendering/package.json');
    const dockerfile = readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
    const dockerVersion = dockerfile.match(/^ARG PLAYWRIGHT_VERSION=(.+)$/m)?.[1];

    expect(workerVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(renderingVersion).toBe(workerVersion);
    expect(dockerVersion).toBe(workerVersion);
  });
});
