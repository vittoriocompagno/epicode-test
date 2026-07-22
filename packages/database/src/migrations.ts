import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultMigrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'drizzle',
);

export async function migrateDatabase(
  connectionString: string,
  migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });

  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
