import { migrateDatabase } from './migrations.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations');
}

await migrateDatabase(connectionString);

console.log('Migrations applied successfully');
