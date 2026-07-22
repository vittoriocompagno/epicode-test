import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseTarget } from '../src/test-database.js';

describe('resolveTestDatabaseTarget', () => {
  it('uses postgres as the maintenance database', () => {
    expect(
      resolveTestDatabaseTarget(
        'postgresql://postgres:postgres@localhost:5432/certificates_test?sslmode=disable',
      ),
    ).toEqual({
      databaseName: 'certificates_test',
      maintenanceUrl: 'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable',
    });
  });

  it('rejects a URL without a database name', () => {
    expect(() => resolveTestDatabaseTarget('postgresql://postgres:postgres@localhost/')).toThrow(
      /database name/i,
    );
  });
});
