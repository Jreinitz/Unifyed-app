import { pgTable, text, timestamp, uuid, varchar, integer, jsonb, pgEnum, index, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';
import { profiles } from './profiles.js';
import { streamingToolConnections } from './streaming-tool-connections.js';

// Live session status
export const liveSessionStatusEnum = pgEnum('live_session_status', [
  'preparing',  // Session created but not yet live
  'live',       // At least one platform is streaming
  'ending',     // Streams ending
  'ended',      // All platforms have stopped
]);

// Live sessions - groups streams across multiple platforms
// When a creator goes live on TikTok, YouTube, and Twitch simultaneously,
// they all belong to the same LiveSession
export const liveSessions = pgTable(
  'live_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Session details
    title: varchar('title', { length: 500 }),
    description: text('description'),
    
    // Status
    status: liveSessionStatusEnum('status').default('preparing').notNull(),
    
    // Timing
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    
    // Aggregated stats across all platforms
    totalPeakViewers: integer('total_peak_viewers'),
    totalViews: integer('total_views'),
    
    // Platform breakdown (e.g., { tiktok: 5000, youtube: 2000, twitch: 1000 })
    viewsByPlatform: jsonb('views_by_platform').$type<Record<string, number>>(),
    
    // Streaming tool used (if any)
    streamingToolConnectionId: uuid('streaming_tool_connection_id').references(
      () => streamingToolConnections.id,
      { onDelete: 'set null' }
    ),
    
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('live_sessions_creator_idx').on(table.creatorId),
    statusIdx: index('live_sessions_status_idx').on(table.status),
    startedAtIdx: index('live_sessions_started_at_idx').on(table.startedAt),
  })
);

// Relations
export const liveSessionsRelations = relations(liveSessions, ({ one }) => ({
  creator: one(creators, {
    fields: [liveSessions.creatorId],
    references: [creators.id],
  }),
  streamingToolConnection: one(streamingToolConnections, {
    fields: [liveSessions.streamingToolConnectionId],
    references: [streamingToolConnections.id],
  }),
}));

// Session templates - reusable configurations for going live
export interface SessionTemplateSettings {
  autoStartChat: boolean;
  autoAnnounce: boolean;
  defaultTitle?: string;
}

export const sessionTemplates = pgTable(
  'session_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    
    // Template details
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    
    // Platforms to stream to (e.g., ['tiktok', 'youtube', 'twitch'])
    platforms: jsonb('platforms').$type<string[]>(),
    
    // Pre-selected offers and products
    defaultOfferIds: jsonb('default_offer_ids').$type<string[]>(),
    defaultProductIds: jsonb('default_product_ids').$type<string[]>(),
    
    // Template settings
    settings: jsonb('settings').$type<SessionTemplateSettings>(),
    
    // Mark one template as the default
    isDefault: boolean('is_default').default(false).notNull(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('session_templates_creator_idx').on(table.creatorId),
    isDefaultIdx: index('session_templates_is_default_idx').on(table.isDefault),
  })
);

// Session template relations
export const sessionTemplatesRelations = relations(sessionTemplates, ({ one }) => ({
  creator: one(profiles, {
    fields: [sessionTemplates.creatorId],
    references: [profiles.id],
  }),
}));
