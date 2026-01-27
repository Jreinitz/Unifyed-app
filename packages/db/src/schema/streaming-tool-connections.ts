import { pgTable, text, timestamp, uuid, varchar, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';

// Streaming tool types
export const streamingToolEnum = pgEnum('streaming_tool', [
  'restream',
  'streamyard',
  'obs',       // Direct OBS with RTMP destinations
]);

// Connection health status for streaming tools
export const streamingToolStatusEnum = pgEnum('streaming_tool_status', [
  'connected',
  'disconnected',
  'pending',
  'error',
]);

// Streaming tool connections - connects to multi-platform streaming tools
// These tools (Restream, StreamYard) allow streaming to multiple platforms at once
export const streamingToolConnections = pgTable(
  'streaming_tool_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    tool: streamingToolEnum('tool').notNull(),
    
    // Encrypted credentials (OAuth tokens, API keys)
    credentials: text('credentials').notNull(), // encrypted JSON
    
    // Tool-specific identifiers
    externalId: varchar('external_id', { length: 255 }), // User ID in the tool
    displayName: varchar('display_name', { length: 255 }), // Human-readable name
    
    // Health monitoring
    status: streamingToolStatusEnum('status').default('pending').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    
    // Tool-specific metadata
    // For Restream: available destination platforms, RTMP settings
    // For StreamYard: studio settings, branding options
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: one connection per tool per creator
    creatorToolUnique: unique('streaming_tool_connections_creator_tool_unique').on(
      table.creatorId,
      table.tool
    ),
    creatorToolIdx: index('streaming_tool_connections_creator_tool_idx').on(
      table.creatorId,
      table.tool
    ),
    statusIdx: index('streaming_tool_connections_status_idx').on(table.status),
  })
);

// Relations
export const streamingToolConnectionsRelations = relations(streamingToolConnections, ({ one }) => ({
  creator: one(creators, {
    fields: [streamingToolConnections.creatorId],
    references: [creators.id],
  }),
}));
