import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import nodemailer from 'nodemailer';
import {
  closeDatabaseClient,
  createDatabaseClient,
  documents,
  templates,
  type DatabaseClient,
} from '@certificates/database';
import { FakePdfRenderer } from '@certificates/rendering';
import { LocalFilesystemStorage } from '@certificates/storage';
import { eq } from 'drizzle-orm';
import { generateCertificateDocument } from './generate.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/certificates_test';

describe('certificate generation', () => {
  let dbClient: DatabaseClient;
  let tempDir: string;
  let storage: LocalFilesystemStorage;
  const renderer = new FakePdfRenderer();
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    dbClient = createDatabaseClient(databaseUrl);
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'cert-storage-'));
    storage = new LocalFilesystemStorage({ rootDir: tempDir });
  });

  afterAll(async () => {
    await closeDatabaseClient(dbClient);
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await dbClient.sql`truncate table batch_items, generation_batches, documents, templates restart identity cascade`;
    renderer.calls.length = 0;
    renderer.failNext = false;
  });

  async function seedQueuedDocument(emailTo?: string) {
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
        status: 'queued',
        emailTo: emailTo ?? null,
        emailStatus: emailTo ? 'pending' : 'skipped',
      })
      .returning();

    return document!;
  }

  it('completes a document and stores a PDF', async () => {
    const document = await seedQueuedDocument();

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
    expect(updated?.outputPath).toBe(`documents/${document.id}.pdf`);
    expect(await storage.exists(updated!.outputPath!)).toBe(true);
    const pdf = await storage.get(updated!.outputPath!);
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('is a no-op when the document is already completed', async () => {
    const document = await seedQueuedDocument();
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
      2,
    );

    expect(renderer.calls).toHaveLength(1);
  });

  it('emails the generated PDF and records successful delivery', async () => {
    const document = await seedQueuedDocument('ada@example.com');
    const mailer = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = vi.spyOn(mailer, 'sendMail');

    await generateCertificateDocument(
      document.id,
      {
        db: dbClient.db,
        storage,
        pdfRenderer: renderer,
        mailer,
        mailFrom: 'certificates@example.com',
        logger,
      },
      1,
    );

    const [updated] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(updated?.status).toBe('completed');
    expect(updated?.emailStatus).toBe('sent');
    expect(updated?.emailedAt).toBeInstanceOf(Date);
    expect(updated?.emailError).toBeNull();

    expect(sendMail).toHaveBeenCalledOnce();
    const message = sendMail.mock.calls[0]?.[0];
    expect(message).toMatchObject({
      from: 'certificates@example.com',
      to: 'ada@example.com',
      attachments: [
        {
          filename: `certificate-${document.id}.pdf`,
          contentType: 'application/pdf',
        },
      ],
    });
    const delivery = await sendMail.mock.results[0]?.value;
    const serialized = JSON.parse(String(delivery.message)) as {
      attachments: Array<{ content: string }>;
    };
    expect(
      Buffer.from(serialized.attachments[0]!.content, 'base64').subarray(0, 4).toString('utf8'),
    ).toBe('%PDF');

    mailer.close();
  });

  it('marks the document failed when the renderer throws on the final attempt', async () => {
    const document = await seedQueuedDocument();
    renderer.failNext = true;

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
        3,
        3,
      ),
    ).rejects.toThrow(/Fake PDF renderer failure/);

    const [updated] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(updated?.status).toBe('failed');
    expect(updated?.errorCode).toBe('GENERATION_FAILED');
  });

  it('requeues the document when the renderer throws before the final attempt', async () => {
    const document = await seedQueuedDocument();
    renderer.failNext = true;

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
        3,
      ),
    ).rejects.toThrow(/Fake PDF renderer failure/);

    const [updated] = await dbClient.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));

    expect(updated?.status).toBe('queued');
    expect(updated?.errorCode).toBeNull();
  });
});
