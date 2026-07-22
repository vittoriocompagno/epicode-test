import { prepareTestDatabase } from './test-database.js';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/certificates_test';

await prepareTestDatabase(testDatabaseUrl);
console.log('Test database is ready');
