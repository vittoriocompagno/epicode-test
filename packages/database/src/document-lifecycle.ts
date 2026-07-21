import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { documents } from './schema.js';

export type DocumentStatus = (typeof documents.status.enumValues)[number];
export type DocumentRow = typeof documents.$inferSelect;

const ACTIVE_FOR_FAILURE: DocumentStatus[] = ['queued', 'processing'];

export async function claimDocumentForProcessing(
  db: Database,
  documentId: string,
): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set({
      status: 'processing',
      attemptCount: sql`${documents.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.status, 'queued')))
    .returning();

  return row ?? null;
}

export async function markDocumentsQueued(
  db: Database,
  documentIds: string[],
  fromStatuses: DocumentStatus[] = ['draft', 'failed'],
): Promise<number> {
  if (documentIds.length === 0) {
    return 0;
  }

  const rows = await db
    .update(documents)
    .set({
      status: 'queued',
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(and(inArray(documents.id, documentIds), inArray(documents.status, fromStatuses)))
    .returning({ id: documents.id });

  return rows.length;
}

export async function markDocumentQueued(
  db: Database,
  documentId: string,
  fromStatuses: DocumentStatus[],
): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set({
      status: 'queued',
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), inArray(documents.status, fromStatuses)))
    .returning();

  return row ?? null;
}

export async function markDocumentCompleted(
  db: Database,
  documentId: string,
  outputPath: string,
): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set({
      status: 'completed',
      outputPath,
      errorCode: null,
      errorMessage: null,
      generatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.status, 'processing')))
    .returning();

  return row ?? null;
}

export async function markDocumentFailed(
  db: Database,
  documentId: string,
  error: { code: string; message: string },
): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set({
      status: 'failed',
      errorCode: error.code,
      errorMessage: error.message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), inArray(documents.status, ACTIVE_FOR_FAILURE)))
    .returning();

  return row ?? null;
}

export async function requeueDocumentAfterTransientFailure(
  db: Database,
  documentId: string,
): Promise<DocumentRow | null> {
  const [row] = await db
    .update(documents)
    .set({
      status: 'queued',
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.status, 'processing')))
    .returning();

  return row ?? null;
}
