import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Internal migration smoke table from initial bootstrap.
 */
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
});

export const schema = {
  schemaBootstrap,
  templates,
  documents,
  documentStatusEnum,
};
