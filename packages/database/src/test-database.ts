import postgres from 'postgres';
import { migrateDatabase } from './migrations.js';

type TestDatabaseTarget = {
  databaseName: string;
  maintenanceUrl: string;
};

export function resolveTestDatabaseTarget(connectionString: string): TestDatabaseTarget {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Test database URL must use the postgres protocol');
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('Test database URL must include exactly one database name');
  }

  url.pathname = '/postgres';
  return {
    databaseName,
    maintenanceUrl: url.toString(),
  };
}

export async function prepareTestDatabase(connectionString: string): Promise<void> {
  const target = resolveTestDatabaseTarget(connectionString);
  const maintenance = postgres(target.maintenanceUrl, { max: 1 });

  try {
    const existing = await maintenance<{ exists: boolean }[]>`
      select exists(
        select 1 from pg_database where datname = ${target.databaseName}
      ) as exists
    `;

    if (!existing[0]?.exists) {
      const identifier = `"${target.databaseName.replaceAll('"', '""')}"`;
      await maintenance.unsafe(`create database ${identifier}`);
    }
  } finally {
    await maintenance.end({ timeout: 5 });
  }

  await migrateDatabase(connectionString);
}
