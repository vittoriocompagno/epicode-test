import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_KEY: z.string().min(1),
  LOCAL_STORAGE_PATH: z.string().min(1).default('./data/documents'),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
  TEMPLATE_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(131_072),
  PREVIEW_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(65_536),
  BATCH_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(32_000_000),
  PREVIEW_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  PREVIEW_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  GENERATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  GENERATE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  BATCH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  BATCH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid API environment:\n${details}`);
  }

  const localStoragePath = path.isAbsolute(parsed.data.LOCAL_STORAGE_PATH)
    ? parsed.data.LOCAL_STORAGE_PATH
    : path.resolve(repoRoot, parsed.data.LOCAL_STORAGE_PATH);

  return {
    ...parsed.data,
    LOCAL_STORAGE_PATH: localStoragePath,
  };
}
