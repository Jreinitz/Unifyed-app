import { z } from 'zod';
import { streamSchema, createStreamSchema, replaySchema, replayWithMomentsSchema, createReplaySchema, momentSchema, createMomentSchema } from '../stream.js';
import { paginationSchema, uuidSchema } from '../common.js';

// GET /streams
export const listStreamsQuerySchema = paginationSchema.extend({
  status: z.enum(['scheduled', 'live', 'ended', 'cancelled']).optional(),
});

export const listStreamsResponseSchema = z.object({
  streams: z.array(streamSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// GET /streams/:id
export const getStreamParamsSchema = z.object({
  id: uuidSchema,
});

export const getStreamResponseSchema = z.object({
  stream: streamSchema,
});

// POST /streams
export const createStreamRequestSchema = createStreamSchema;
export const createStreamResponseSchema = z.object({
  stream: streamSchema,
});

// POST /streams/:id/start
export const startStreamParamsSchema = z.object({
  id: uuidSchema,
});
export const startStreamResponseSchema = z.object({
  stream: streamSchema,
});

// POST /streams/:id/end
export const endStreamParamsSchema = z.object({
  id: uuidSchema,
});
export const endStreamResponseSchema = z.object({
  stream: streamSchema,
  replay: replaySchema.optional(),
});

// POST /streams/:id/moments
export const createMomentParamsSchema = z.object({
  id: uuidSchema,
});
export const createMomentRequestSchema = createMomentSchema;
export const createMomentResponseSchema = z.object({
  moment: momentSchema,
});

// GET /replays
export const listReplaysQuerySchema = paginationSchema.extend({
  isPublished: z.coerce.boolean().optional(),
});

export const listReplaysResponseSchema = z.object({
  replays: z.array(replaySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// GET /replays/:id
export const getReplayParamsSchema = z.object({
  id: uuidSchema,
});

export const getReplayResponseSchema = z.object({
  replay: replayWithMomentsSchema,
});

// POST /replays
export const createReplayRequestSchema = createReplaySchema;
export const createReplayResponseSchema = z.object({
  replay: replaySchema,
});

// POST /replays/:id/publish
export const publishReplayParamsSchema = z.object({
  id: uuidSchema,
});
export const publishReplayResponseSchema = z.object({
  replay: replaySchema,
});

// GET /replays/:id/moments
export const getReplayMomentsParamsSchema = z.object({
  id: uuidSchema,
});
export const getReplayMomentsResponseSchema = z.object({
  moments: z.array(momentSchema),
});

export type ListStreamsQuery = z.infer<typeof listStreamsQuerySchema>;
export type ListStreamsResponse = z.infer<typeof listStreamsResponseSchema>;
export type GetStreamParams = z.infer<typeof getStreamParamsSchema>;
export type GetStreamResponse = z.infer<typeof getStreamResponseSchema>;
export type CreateStreamRequest = z.infer<typeof createStreamRequestSchema>;
export type CreateStreamResponse = z.infer<typeof createStreamResponseSchema>;
export type StartStreamParams = z.infer<typeof startStreamParamsSchema>;
export type StartStreamResponse = z.infer<typeof startStreamResponseSchema>;
export type EndStreamParams = z.infer<typeof endStreamParamsSchema>;
export type EndStreamResponse = z.infer<typeof endStreamResponseSchema>;
export type CreateMomentParams = z.infer<typeof createMomentParamsSchema>;
export type CreateMomentRequest = z.infer<typeof createMomentRequestSchema>;
export type CreateMomentResponse = z.infer<typeof createMomentResponseSchema>;
export type ListReplaysQuery = z.infer<typeof listReplaysQuerySchema>;
export type ListReplaysResponse = z.infer<typeof listReplaysResponseSchema>;
export type GetReplayParams = z.infer<typeof getReplayParamsSchema>;
export type GetReplayResponse = z.infer<typeof getReplayResponseSchema>;
export type CreateReplayRequest = z.infer<typeof createReplayRequestSchema>;
export type CreateReplayResponse = z.infer<typeof createReplayResponseSchema>;
export type PublishReplayParams = z.infer<typeof publishReplayParamsSchema>;
export type PublishReplayResponse = z.infer<typeof publishReplayResponseSchema>;
export type GetReplayMomentsParams = z.infer<typeof getReplayMomentsParamsSchema>;
export type GetReplayMomentsResponse = z.infer<typeof getReplayMomentsResponseSchema>;
