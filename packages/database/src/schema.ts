import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const schemaBootstrap = pgTable('schema_bootstrap', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documentStatusEnum = pgEnum('document_status', [
  'draft',
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const emailStatusEnum = pgEnum('email_status', [
  'pending',
  'sent',
  'failed',
  'skipped',
]);

export const batchStatusEnum = pgEnum('batch_status', [
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const batchItemStatusEnum = pgEnum('batch_item_status', [
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const templates = pgTable('templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  html: text('html').notNull(),
  variables: jsonb('variables').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => templates.id, { onDelete: 'restrict' }),
  variables: jsonb('variables').$type<Record<string, unknown>>().notNull().default({}),
  status: documentStatusEnum('status').notNull().default('draft'),
  outputPath: text('output_path'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  attemptCount: integer('attempt_count').notNull().default(0),
  emailTo: text('email_to'),
  emailStatus: emailStatusEnum('email_status'),
  emailError: text('email_error'),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
});

export const generationBatches = pgTable('generation_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => templates.id, { onDelete: 'restrict' }),
  status: batchStatusEnum('status').notNull().default('queued'),
  totalCount: integer('total_count').notNull().default(0),
  emailTo: text('email_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const batchItems = pgTable('batch_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => generationBatches.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  status: batchItemStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const schema = {
  schemaBootstrap,
  templates,
  documents,
  generationBatches,
  batchItems,
  documentStatusEnum,
  emailStatusEnum,
  batchStatusEnum,
  batchItemStatusEnum,
};
