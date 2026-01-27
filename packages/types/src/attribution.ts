import { z } from 'zod';
import { uuidSchema, timestampsSchema } from './common.js';
import { platformSchema } from './platform.js';

// Surface type
export const surfaceTypeSchema = z.enum([
  'live',
  'replay',
  'clip',
  'link_in_bio',
  'dm',
  'agent',
  'direct',
]);
export type SurfaceType = z.infer<typeof surfaceTypeSchema>;

// Attribution context
export const attributionContextSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  platform: platformSchema.nullable(),
  platformConnectionId: uuidSchema.nullable(),
  surface: surfaceTypeSchema,
  streamId: uuidSchema.nullable(),
  replayId: uuidSchema.nullable(),
  momentId: uuidSchema.nullable(),
  platformStreamId: z.string().nullable(),
  platformVideoId: z.string().nullable(),
  campaign: z.string().nullable(),
  source: z.string().nullable(),
  medium: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});

export type AttributionContext = z.infer<typeof attributionContextSchema>;

// Create attribution context input
export const createAttributionContextSchema = z.object({
  platform: platformSchema.optional(),
  platformConnectionId: uuidSchema.optional(),
  surface: surfaceTypeSchema,
  streamId: uuidSchema.optional(),
  replayId: uuidSchema.optional(),
  momentId: uuidSchema.optional(),
  platformStreamId: z.string().optional(),
  platformVideoId: z.string().optional(),
  campaign: z.string().optional(),
  source: z.string().optional(),
  medium: z.string().optional(),
});

export type CreateAttributionContextInput = z.infer<typeof createAttributionContextSchema>;

// Short link
export const shortLinkSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  code: z.string(),
  offerId: uuidSchema,
  attributionContextId: uuidSchema,
  name: z.string().nullable(),
  expiresAt: z.coerce.date().nullable(),
  isRevoked: z.boolean(),
  revokedAt: z.coerce.date().nullable(),
  maxClicks: z.number().int().nullable(),
  clickCount: z.number().int(),
  lastClickedAt: z.coerce.date().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
});

export type ShortLink = z.infer<typeof shortLinkSchema>;

// Create short link input
export const createShortLinkSchema = z.object({
  offerId: uuidSchema,
  name: z.string().max(255).optional(),
  surface: surfaceTypeSchema,
  streamId: uuidSchema.optional(),
  replayId: uuidSchema.optional(),
  momentId: uuidSchema.optional(),
  platform: platformSchema.optional(),
  expiresAt: z.coerce.date().optional(),
  maxClicks: z.number().int().min(1).optional(),
});

export type CreateShortLinkInput = z.infer<typeof createShortLinkSchema>;
