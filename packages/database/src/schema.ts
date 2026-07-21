import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Minimal bootstrap table used only to verify migrations work.
 * Domain tables (templates, documents, batches) will be added later.
 */
export const schemaBootstrap = pgTable('schema_bootstrap', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const schema = {
  schemaBootstrap,
};
