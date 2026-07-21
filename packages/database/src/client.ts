import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { schema } from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export type DatabaseClient = {
  db: Database;
  sql: Sql;
};

export function createDatabaseClient(connectionString: string): DatabaseClient {
  const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(sql, { schema });

  return { db, sql };
}

export async function closeDatabaseClient(client: DatabaseClient): Promise<void> {
  await client.sql.end({ timeout: 5 });
}

export async function pingDatabase(client: DatabaseClient): Promise<boolean> {
  const result = await client.sql`select 1 as ok`;
  return result[0]?.ok === 1;
}
