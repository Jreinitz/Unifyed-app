import { pgTable, text, timestamp, uuid, varchar, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';
import { platformConnections, platformEnum } from './platform-connections.js';
import { liveSessions } from './live-sessions.js';

// Stream source
export const streamSourceEnum = pgEnum('stream_source', [
  'auto_detected', // Detected from platform API
  'manual',        // Manually created by creator
]);

// Stream status
export const streamStatusEnum = pgEnum('stream_status', [
  'scheduled',
  'live',
  'ended',
  'cancelled',
]);

// Replay video source
export const videoSourceEnum = pgEnum('video_source', [
  'platform_import', // Auto-imported from TikTok/YouTube
  'manual_url',      // Manually provided URL
  'uploaded',        // Uploaded to our storage
]);

// Streams
export const streams = pgTable(
  'streams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Live session (groups streams across platforms)
    liveSessionId: uuid('live_session_id').references(
      () => liveSessions.id,
      { onDelete: 'set null' }
    ),
    
    // Source platform
    platform: platformEnum('platform'),
    platformConnectionId: uuid('platform_connection_id').references(
      () => platformConnections.id,
      { onDelete: 'set null' }
    ),
    
    // External reference
    platformStreamId: varchar('platform_stream_id', { length: 255 }),
    
    // How this stream was created
    source: streamSourceEnum('source').default('manual').notNull(),
    
    // Stream details
    title: varchar('title', { length: 500 }),
    description: text('description'),
    thumbnailUrl: text('thumbnail_url'),
    
    // Status
    status: streamStatusEnum('status').default('scheduled').notNull(),
    
    // Timing
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
    actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    
    // Stats from platform
    peakViewers: integer('peak_viewers'),
    totalViews: integer('total_views'),
    
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('streams_creator_idx').on(table.creatorId),
    liveSessionIdx: index('streams_live_session_idx').on(table.liveSessionId),
    platformStreamIdx: index('streams_platform_stream_idx').on(table.platformStreamId),
    statusIdx: index('streams_status_idx').on(table.status),
  })
);

// Replays (created when stream ends)
export const replays = pgTable(
  'replays',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Parent stream (optional - replays can exist without a stream)
    streamId: uuid('stream_id').references(() => streams.id, { onDelete: 'set null' }),
    
    // Source platform
    platform: platformEnum('platform'),
    platformConnectionId: uuid('platform_connection_id').references(
      () => platformConnections.id,
      { onDelete: 'set null' }
    ),
    platformVideoId: varchar('platform_video_id', { length: 255 }),
    
    // Video source
    videoSource: videoSourceEnum('video_source').default('manual_url').notNull(),
    videoUrl: text('video_url'),
    
    // Replay details
    title: varchar('title', { length: 500 }),
    description: text('description'),
    thumbnailUrl: text('thumbnail_url'),
    duration: integer('duration'), // seconds
    
    // Public page slug
    slug: varchar('slug', { length: 100 }).unique(),
    
    // Publishing state
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    
    // Stats
    viewCount: integer('view_count').default(0).notNull(),
    clickCount: integer('click_count').default(0).notNull(),
    
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('replays_creator_idx').on(table.creatorId),
    streamIdx: index('replays_stream_idx').on(table.streamId),
    slugIdx: index('replays_slug_idx').on(table.slug),
    platformVideoIdx: index('replays_platform_video_idx').on(table.platformVideoId),
  })
);

// Import boolean for replays
import { boolean } from 'drizzle-orm/pg-core';

// Moments (timestamp markers within streams/replays)
export const moments = pgTable(
  'moments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Parent (stream or replay)
    streamId: uuid('stream_id').references(() => streams.id, { onDelete: 'cascade' }),
    replayId: uuid('replay_id').references(() => replays.id, { onDelete: 'cascade' }),
    
    // Moment details
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    
    // Timestamp in the video (seconds)
    timestamp: integer('timestamp').notNull(),
    
    // Visual marker
    thumbnailUrl: text('thumbnail_url'),
    
    // Display order
    sortOrder: integer('sort_order').default(0).notNull(),
    
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('moments_creator_idx').on(table.creatorId),
    streamIdx: index('moments_stream_idx').on(table.streamId),
    replayIdx: index('moments_replay_idx').on(table.replayId),
  })
);

// Relations
export const streamsRelations = relations(streams, ({ one, many }) => ({
  creator: one(creators, {
    fields: [streams.creatorId],
    references: [creators.id],
  }),
  liveSession: one(liveSessions, {
    fields: [streams.liveSessionId],
    references: [liveSessions.id],
  }),
  platformConnection: one(platformConnections, {
    fields: [streams.platformConnectionId],
    references: [platformConnections.id],
  }),
  replays: many(replays),
  moments: many(moments),
}));

export const replaysRelations = relations(replays, ({ one, many }) => ({
  creator: one(creators, {
    fields: [replays.creatorId],
    references: [creators.id],
  }),
  stream: one(streams, {
    fields: [replays.streamId],
    references: [streams.id],
  }),
  platformConnection: one(platformConnections, {
    fields: [replays.platformConnectionId],
    references: [platformConnections.id],
  }),
  moments: many(moments),
}));

export const momentsRelations = relations(moments, ({ one }) => ({
  creator: one(creators, {
    fields: [moments.creatorId],
    references: [creators.id],
  }),
  stream: one(streams, {
    fields: [moments.streamId],
    references: [streams.id],
  }),
  replay: one(replays, {
    fields: [moments.replayId],
    references: [replays.id],
  }),
}));
