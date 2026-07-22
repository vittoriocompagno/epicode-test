import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import {
  batchItems,
  closeDatabaseClient,
  createDatabaseClient,
  documents,
  generationBatches,
  templates,
  type DatabaseClient,
} from '@certificates/database';
import { FakePdfRenderer } from '@certificates/rendering';
import type { DocumentStorage } from '@certificates/storage';
import { eq } from 'drizzle-orm';
import { generateCertificateDocument } from '../src/generate.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/certificates_test';

describe('batch dispatch race', () => {
  let dbClient: DatabaseClient;
  const renderer = new FakePdfRenderer();
  const storage: DocumentStorage = {
    put: async (input) => ({
      key: input.key,
      contentType: input.contentType,
      size: input.body.length,
    }),
    get: async () => Buffer.alloc(0),
    exists: async () => true,
    delete: async () => {},
  };
  const logger = pino({ level: 'silent' });

  beforeAll(() => {
    dbClient = createDatabaseClient(databaseUrl);
  });

  afterAll(async () => {
    await closeDatabaseClient(dbClient);
  });

  beforeEach(async () => {
    await dbClient.sql`truncate table batch_items, generation_batches, documents, templates restart identity cascade`;
    renderer.calls.length = 0;
  });

  async function seedDraft(addToBatch: boolean) {
    const [template] = await dbClient.db
      .insert(templates)
      .values({
        name: 'Diploma',
        html: '<h1>{{studentName}}</h1>',
        variables: ['studentName'],
      })
      .returning();
    const [document] = await dbClient.db
      .insert(documents)
      .values({
        templateId: template!.id,
        variables: { studentName: 'Ada' },
        status: 'draft',
      })
      .returning();

    if (addToBatch) {
      const [batch] = await dbClient.db
        .insert(generationBatches)
        .values({ templateId: template!.id, totalCount: 1 })
        .returning();
      await dbClient.db.insert(batchItems).values({
        batchId: batch!.id,
        documentId: document!.id,
      });
    }

    return document!;
  }

  it('processes a batch draft when its job wins the queued transition race', async () => {
    const document = await seedDraft(true);

    await generateCertificateDocument(
      document.id,
      {
        db: dbClient.db,
        storage,
        pdfRenderer: renderer,
        mailer: null,
        mailFrom: 'test@localhost',
        logger,
      },
      1,
    );

    const [updated] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(updated?.status).toBe('completed');
    expect(renderer.calls).toHaveLength(1);
  });

  it('does not process a standalone draft', async () => {
    const document = await seedDraft(false);

    await expect(
      generateCertificateDocument(
        document.id,
        {
          db: dbClient.db,
          storage,
          pdfRenderer: renderer,
          mailer: null,
          mailFrom: 'test@localhost',
          logger,
        },
        1,
      ),
    ).rejects.toThrow(/Unable to claim document/);

    const [unchanged] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(unchanged?.status).toBe('draft');
    expect(renderer.calls).toHaveLength(0);
  });
});
