export { createDatabaseClient, closeDatabaseClient, pingDatabase } from './client.js';
export type { Database, DatabaseClient } from './client.js';
export {
  schema,
  schemaBootstrap,
  templates,
  documents,
  generationBatches,
  batchItems,
  documentStatusEnum,
  emailStatusEnum,
  batchStatusEnum,
  batchItemStatusEnum,
} from './schema.js';
export {
  claimDocumentForProcessing,
  markDocumentCompleted,
  markDocumentFailed,
  markDocumentQueued,
  markDocumentsQueued,
  requeueDocumentAfterTransientFailure,
  type DocumentRow,
  type DocumentStatus,
} from './document-lifecycle.js';
export {
  deriveBatchStatus,
  persistDerivedBatchStatus,
  summarizeBatch,
  summarizeBatches,
  type BatchProgress,
  type BatchProgressCounts,
} from './batch-progress.js';
