import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  BATCH_DISPATCH_CHUNK_SIZE: z.coerce.number().int().positive().default(500),
  LOCAL_STORAGE_PATH: z.string().min(1).default('./data/documents'),
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default('certificates@localhost'),
  MAIL_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  PDF_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid worker environment:\n${details}`);
  }

  const localStoragePath = path.isAbsolute(parsed.data.LOCAL_STORAGE_PATH)
    ? parsed.data.LOCAL_STORAGE_PATH
    : path.resolve(repoRoot, parsed.data.LOCAL_STORAGE_PATH);

  return {
    ...parsed.data,
    LOCAL_STORAGE_PATH: localStoragePath,
  };
}
