import { z } from 'zod';
import { uuidSchema, timestampsSchema } from './common.js';
import { platformSchema } from './platform.js';

// Stream source
export const streamSourceSchema = z.enum(['auto_detected', 'manual']);
export type StreamSource = z.infer<typeof streamSourceSchema>;

// Stream status
export const streamStatusSchema = z.enum(['scheduled', 'live', 'ended', 'cancelled']);
export type StreamStatus = z.infer<typeof streamStatusSchema>;

// Video source
export const videoSourceSchema = z.enum(['platform_import', 'manual_url', 'uploaded']);
export type VideoSource = z.infer<typeof videoSourceSchema>;

// Stream
export const streamSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  platform: platformSchema.nullable(),
  platformConnectionId: uuidSchema.nullable(),
  platformStreamId: z.string().nullable(),
  source: streamSourceSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  status: streamStatusSchema,
  scheduledStartAt: z.coerce.date().nullable(),
  actualStartAt: z.coerce.date().nullable(),
  endedAt: z.coerce.date().nullable(),
  peakViewers: z.number().int().nullable(),
  totalViews: z.number().int().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
});

export type Stream = z.infer<typeof streamSchema>;

// Create stream input
export const createStreamSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  platform: platformSchema.optional(),
  platformConnectionId: uuidSchema.optional(),
  scheduledStartAt: z.coerce.date().optional(),
});

export type CreateStreamInput = z.infer<typeof createStreamSchema>;

// Replay
export const replaySchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  streamId: uuidSchema.nullable(),
  platform: platformSchema.nullable(),
  platformConnectionId: uuidSchema.nullable(),
  platformVideoId: z.string().nullable(),
  videoSource: videoSourceSchema,
  videoUrl: z.string().url().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  duration: z.number().int().nullable(),
  slug: z.string().nullable(),
  isPublished: z.boolean(),
  publishedAt: z.coerce.date().nullable(),
  viewCount: z.number().int(),
  clickCount: z.number().int(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
});

export type Replay = z.infer<typeof replaySchema>;

// Create replay input
export const createReplaySchema = z.object({
  streamId: uuidSchema.optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  videoUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  duration: z.number().int().min(0).optional(),
});

export type CreateReplayInput = z.infer<typeof createReplaySchema>;

// Moment
export const momentSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  streamId: uuidSchema.nullable(),
  replayId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  timestamp: z.number().int(), // seconds
  thumbnailUrl: z.string().url().nullable(),
  sortOrder: z.number().int(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
});

export type Moment = z.infer<typeof momentSchema>;

// Create moment input
export const createMomentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  timestamp: z.number().int().min(0),
  thumbnailUrl: z.string().url().optional(),
});

export type CreateMomentInput = z.infer<typeof createMomentSchema>;

// Replay with moments
export const replayWithMomentsSchema = replaySchema.extend({
  moments: z.array(momentSchema),
});

export type ReplayWithMoments = z.infer<typeof replayWithMomentsSchema>;
