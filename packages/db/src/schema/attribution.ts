import { pgTable, timestamp, uuid, varchar, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';
import { platformConnections, platformEnum } from './platform-connections.js';
import { liveSessions } from './live-sessions.js';

// Surface types (where the click/purchase originated)
export const surfaceTypeEnum = pgEnum('surface_type', [
  'live',
  'replay',
  'clip',
  'link_in_bio',
  'dm',
  'agent',
  'direct',
]);

// Attribution contexts - tracks the source of every checkout
export const attributionContexts = pgTable(
  'attribution_contexts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Platform that originated this context
    platform: platformEnum('platform'),
    platformConnectionId: uuid('platform_connection_id').references(
      () => platformConnections.id,
      { onDelete: 'set null' }
    ),
    
    // Surface type
    surface: surfaceTypeEnum('surface').notNull(),
    
    // References to content (nullable depending on surface)
    liveSessionId: uuid('live_session_id').references(
      () => liveSessions.id,
      { onDelete: 'set null' }
    ), // Links to multi-platform session
    streamId: uuid('stream_id'), // FK added in streams.ts (specific platform stream)
    replayId: uuid('replay_id'), // FK added in streams.ts
    momentId: uuid('moment_id'), // FK added in streams.ts
    
    // External identifiers
    platformStreamId: varchar('platform_stream_id', { length: 255 }), // TikTok/YouTube stream ID
    platformVideoId: varchar('platform_video_id', { length: 255 }), // TikTok/YouTube video ID
    
    // Campaign/UTM tracking
    campaign: varchar('campaign', { length: 255 }),
    source: varchar('source', { length: 255 }),
    medium: varchar('medium', { length: 255 }),
    
    // Additional context
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('attribution_contexts_creator_idx').on(table.creatorId),
    surfaceIdx: index('attribution_contexts_surface_idx').on(table.surface),
    liveSessionIdx: index('attribution_contexts_live_session_idx').on(table.liveSessionId),
    streamIdx: index('attribution_contexts_stream_idx').on(table.streamId),
    replayIdx: index('attribution_contexts_replay_idx').on(table.replayId),
  })
);

// Relations
export const attributionContextsRelations = relations(attributionContexts, ({ one }) => ({
  creator: one(creators, {
    fields: [attributionContexts.creatorId],
    references: [creators.id],
  }),
  platformConnection: one(platformConnections, {
    fields: [attributionContexts.platformConnectionId],
    references: [platformConnections.id],
  }),
  liveSession: one(liveSessions, {
    fields: [attributionContexts.liveSessionId],
    references: [liveSessions.id],
  }),
}));
