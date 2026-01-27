import { pgTable, text, timestamp, uuid, varchar, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';

// Platform types
export const platformEnum = pgEnum('platform', [
  'shopify',
  'tiktok',
  'youtube',
  'instagram',
  'twitch',
]);

// Connection health status
export const connectionStatusEnum = pgEnum('connection_status', [
  'healthy',
  'degraded',
  'disconnected',
  'pending',
]);

export const platformConnections = pgTable(
  'platform_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    
    // Encrypted credentials (OAuth tokens, API keys, etc.)
    // Structure varies by platform - stored as encrypted JSON
    credentials: text('credentials').notNull(), // encrypted JSON
    
    // Platform-specific identifiers
    externalId: varchar('external_id', { length: 255 }), // shop domain, channel ID, etc.
    displayName: varchar('display_name', { length: 255 }), // human-readable name
    
    // Health monitoring
    status: connectionStatusEnum('status').default('pending').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    
    // Platform-specific metadata (non-sensitive)
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: one connection per platform per creator
    creatorPlatformUnique: unique('platform_connections_creator_platform_unique').on(
      table.creatorId,
      table.platform
    ),
    creatorPlatformIdx: index('platform_connections_creator_platform_idx').on(
      table.creatorId,
      table.platform
    ),
    statusIdx: index('platform_connections_status_idx').on(table.status),
  })
);

// Relations
export const platformConnectionsRelations = relations(platformConnections, ({ one }) => ({
  creator: one(creators, {
    fields: [platformConnections.creatorId],
    references: [creators.id],
  }),
}));
