import { pgTable, text, timestamp, uuid, varchar, jsonb, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';

// Event processing status
export const eventProcessingStatusEnum = pgEnum('event_processing_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped',
]);

// Event log - the event spine
export const eventLog = pgTable(
  'event_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    
    // Event identity (for idempotency)
    eventId: varchar('event_id', { length: 255 }).notNull().unique(),
    
    // Event type
    eventType: varchar('event_type', { length: 100 }).notNull(),
    
    // Actor
    creatorId: uuid('creator_id').references(() => creators.id, { onDelete: 'set null' }),
    
    // Event payload
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    
    // Processing status
    processingStatus: eventProcessingStatusEnum('processing_status').default('pending').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),
    processingAttempts: integer('processing_attempts').default(0).notNull(),
    
    // Metadata
    metadata: jsonb('metadata').$type<{
      source?: string;
      userAgent?: string;
      ipAddress?: string;
      correlationId?: string;
    }>(),
    
    // Timestamps
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventTypeIdx: index('event_log_event_type_idx').on(table.eventType),
    creatorIdx: index('event_log_creator_idx').on(table.creatorId),
    processingStatusIdx: index('event_log_processing_status_idx').on(table.processingStatus),
    occurredAtIdx: index('event_log_occurred_at_idx').on(table.occurredAt),
  })
);

// Import integer for processing attempts
import { integer } from 'drizzle-orm/pg-core';

// Relations
export const eventLogRelations = relations(eventLog, ({ one }) => ({
  creator: one(creators, {
    fields: [eventLog.creatorId],
    references: [creators.id],
  }),
}));
