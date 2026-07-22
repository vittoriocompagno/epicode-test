export { createDatabaseClient, closeDatabaseClient } from './client.js';
export type { Database, DatabaseClient } from './client.js';
export {
  templates,
  documents,
  generationBatches,
  batchItems,
} from './schema.js';
export {
  claimDocumentForProcessing,
  markDocumentCompleted,
  markDocumentFailed,
  markDocumentQueued,
  markDocumentsQueued,
  requeueDocumentAfterTransientFailure,
} from './document-lifecycle.js';
export {
  deriveBatchStatus,
  persistDerivedBatchStatus,
  summarizeBatch,
  summarizeBatches,
} from './batch-progress.js';
