import { z } from 'zod';

// ===== Public Replay API =====

export const getPublicReplayParamsSchema = z.object({
  idOrSlug: z.string(),
});

export const publicMomentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  timestamp: z.number().int(),
  thumbnailUrl: z.string().nullable(),
});

export const publicOfferProductSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  originalPrice: z.number().int(),
  offerPrice: z.number().int(),
  currency: z.string(),
  shortLinkCode: z.string(),
  shortLinkUrl: z.string(),
});

export const publicOfferSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['percentage_off', 'fixed_amount_off', 'fixed_price', 'bundle']),
  value: z.number().int(),
  badgeText: z.string().nullable(),
  products: z.array(publicOfferProductSchema),
});

export const publicReplayResponseSchema = z.object({
  replay: z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    videoUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    duration: z.number().int().nullable(),
    slug: z.string().nullable(),
    viewCount: z.number().int(),
    platform: z.enum(['shopify', 'tiktok', 'youtube', 'instagram', 'twitch']).nullable(),
    publishedAt: z.coerce.date().nullable(),
    creator: z.object({
      name: z.string(),
      handle: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    }),
    moments: z.array(publicMomentSchema),
    offers: z.array(publicOfferSchema),
  }),
});

export type GetPublicReplayParams = z.infer<typeof getPublicReplayParamsSchema>;
export type PublicMoment = z.infer<typeof publicMomentSchema>;
export type PublicOfferProduct = z.infer<typeof publicOfferProductSchema>;
export type PublicOffer = z.infer<typeof publicOfferSchema>;
export type PublicReplayResponse = z.infer<typeof publicReplayResponseSchema>;

// ===== Public Creator API =====

export const getPublicCreatorParamsSchema = z.object({
  handle: z.string(),
});

export const publicCreatorOfferSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  badgeText: z.string().nullable(),
  shortLinkCode: z.string(),
  shortLinkUrl: z.string(),
  products: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    imageUrl: z.string().nullable(),
    originalPrice: z.number().int(),
    offerPrice: z.number().int(),
    currency: z.string(),
  })),
});

export const publicCreatorResponseSchema = z.object({
  creator: z.object({
    name: z.string(),
    handle: z.string(),
    avatarUrl: z.string().nullable(),
    bio: z.string().nullable(),
    offers: z.array(publicCreatorOfferSchema),
  }),
});

export type GetPublicCreatorParams = z.infer<typeof getPublicCreatorParamsSchema>;
export type PublicCreatorOffer = z.infer<typeof publicCreatorOfferSchema>;
export type PublicCreatorResponse = z.infer<typeof publicCreatorResponseSchema>;

// ===== Public Events API =====

export const emitPublicEventRequestSchema = z.object({
  eventType: z.enum(['REPLAY_VIEW', 'REPLAY_CLICK', 'LINK_IN_BIO_VIEW', 'LINK_IN_BIO_CLICK']),
  payload: z.object({
    replayId: z.string().uuid().optional(),
    creatorId: z.string().uuid().optional(),
    handle: z.string().optional(),
    shortLinkId: z.string().uuid().optional(),
    momentId: z.string().uuid().optional(),
    visitorId: z.string().optional(),
    referrer: z.string().optional(),
  }),
});

export const emitPublicEventResponseSchema = z.object({
  success: z.boolean(),
  eventId: z.string().optional(),
});

export type EmitPublicEventRequest = z.infer<typeof emitPublicEventRequestSchema>;
export type EmitPublicEventResponse = z.infer<typeof emitPublicEventResponseSchema>;
