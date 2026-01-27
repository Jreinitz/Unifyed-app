import { z } from 'zod';
import { EVENT_TYPES, type EventType, type BaseEvent } from './types.js';

// Platform connection payloads
export const platformConnectedPayloadSchema = z.object({
  connectionId: z.string().uuid(),
  platform: z.enum(['shopify', 'tiktok', 'youtube', 'instagram', 'twitch']),
  externalId: z.string().nullable(),
  displayName: z.string().nullable(),
});

export const platformDisconnectedPayloadSchema = z.object({
  connectionId: z.string().uuid(),
  platform: z.enum(['shopify', 'tiktok', 'youtube', 'instagram', 'twitch']),
  reason: z.string().optional(),
});

// Product payloads
export const productSyncedPayloadSchema = z.object({
  productId: z.string().uuid(),
  connectionId: z.string().uuid(),
  externalId: z.string(),
  title: z.string(),
  variantCount: z.number().int(),
});

export const inventoryUpdatedPayloadSchema = z.object({
  variantId: z.string().uuid(),
  previousQuantity: z.number().int(),
  newQuantity: z.number().int(),
  source: z.string(),
});

// Offer payloads
export const offerCreatedPayloadSchema = z.object({
  offerId: z.string().uuid(),
  name: z.string(),
  type: z.enum(['percentage_off', 'fixed_amount_off', 'fixed_price', 'bundle']),
  value: z.number().int(),
  productCount: z.number().int(),
});

export const offerActivatedPayloadSchema = z.object({
  offerId: z.string().uuid(),
  name: z.string(),
  activatedAt: z.coerce.date(),
});

export const offerDeactivatedPayloadSchema = z.object({
  offerId: z.string().uuid(),
  name: z.string(),
  reason: z.enum(['manual', 'expired', 'limit_reached']),
});

// Stream payloads
export const streamCreatedPayloadSchema = z.object({
  streamId: z.string().uuid(),
  title: z.string().nullable(),
  platform: z.enum(['shopify', 'tiktok', 'youtube', 'instagram', 'twitch']).nullable(),
  source: z.enum(['auto_detected', 'manual']),
});

export const streamAutoDetectedPayloadSchema = z.object({
  streamId: z.string().uuid(),
  platform: z.enum(['tiktok', 'youtube', 'instagram', 'twitch']),
  platformStreamId: z.string(),
  title: z.string().nullable(),
});

export const streamStartedPayloadSchema = z.object({
  streamId: z.string().uuid(),
  startedAt: z.coerce.date(),
});

export const streamEndedPayloadSchema = z.object({
  streamId: z.string().uuid(),
  endedAt: z.coerce.date(),
  duration: z.number().int(), // seconds
  peakViewers: z.number().int().nullable(),
});

// Replay payloads
export const replayCreatedPayloadSchema = z.object({
  replayId: z.string().uuid(),
  streamId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  videoSource: z.enum(['platform_import', 'manual_url', 'uploaded']),
});

export const replayAutoImportedPayloadSchema = z.object({
  replayId: z.string().uuid(),
  platform: z.enum(['tiktok', 'youtube', 'instagram', 'twitch']),
  platformVideoId: z.string(),
  videoUrl: z.string().url(),
});

export const replayViewPayloadSchema = z.object({
  replayId: z.string().uuid(),
  visitorId: z.string().nullable(),
  referrer: z.string().nullable(),
});

export const replayClickPayloadSchema = z.object({
  replayId: z.string().uuid(),
  shortLinkId: z.string().uuid(),
  momentId: z.string().uuid().nullable(),
  visitorId: z.string().nullable(),
});

// Checkout payloads
export const checkoutStartedPayloadSchema = z.object({
  checkoutSessionId: z.string().uuid(),
  shortLinkId: z.string().uuid(),
  offerId: z.string().uuid(),
  attributionContextId: z.string().uuid(),
  cartTotal: z.number().int(),
  itemCount: z.number().int(),
});

export const purchaseCompletedPayloadSchema = z.object({
  orderId: z.string().uuid(),
  checkoutSessionId: z.string().uuid().nullable(),
  attributionContextId: z.string().uuid().nullable(),
  externalOrderId: z.string(),
  total: z.number().int(),
  currency: z.string(),
  itemCount: z.number().int(),
});

// Reservation payloads
export const reservationCreatedPayloadSchema = z.object({
  reservationId: z.string().uuid(),
  variantId: z.string().uuid(),
  checkoutSessionId: z.string().uuid(),
  quantity: z.number().int(),
  expiresAt: z.coerce.date(),
});

export const reservationExpiredPayloadSchema = z.object({
  reservationId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().int(),
});

// Link in bio payloads
export const linkInBioViewPayloadSchema = z.object({
  creatorId: z.string().uuid(),
  handle: z.string(),
  visitorId: z.string().nullable(),
  referrer: z.string().nullable(),
});

export const linkInBioClickPayloadSchema = z.object({
  creatorId: z.string().uuid(),
  shortLinkId: z.string().uuid(),
  offerId: z.string().uuid(),
  visitorId: z.string().nullable(),
});

// Payload type map
export type EventPayloads = {
  [EVENT_TYPES.PLATFORM_CONNECTED]: z.infer<typeof platformConnectedPayloadSchema>;
  [EVENT_TYPES.PLATFORM_DISCONNECTED]: z.infer<typeof platformDisconnectedPayloadSchema>;
  [EVENT_TYPES.PRODUCT_SYNCED]: z.infer<typeof productSyncedPayloadSchema>;
  [EVENT_TYPES.INVENTORY_UPDATED]: z.infer<typeof inventoryUpdatedPayloadSchema>;
  [EVENT_TYPES.OFFER_CREATED]: z.infer<typeof offerCreatedPayloadSchema>;
  [EVENT_TYPES.OFFER_ACTIVATED]: z.infer<typeof offerActivatedPayloadSchema>;
  [EVENT_TYPES.OFFER_DEACTIVATED]: z.infer<typeof offerDeactivatedPayloadSchema>;
  [EVENT_TYPES.STREAM_CREATED]: z.infer<typeof streamCreatedPayloadSchema>;
  [EVENT_TYPES.STREAM_AUTO_DETECTED]: z.infer<typeof streamAutoDetectedPayloadSchema>;
  [EVENT_TYPES.STREAM_STARTED]: z.infer<typeof streamStartedPayloadSchema>;
  [EVENT_TYPES.STREAM_ENDED]: z.infer<typeof streamEndedPayloadSchema>;
  [EVENT_TYPES.REPLAY_CREATED]: z.infer<typeof replayCreatedPayloadSchema>;
  [EVENT_TYPES.REPLAY_AUTO_IMPORTED]: z.infer<typeof replayAutoImportedPayloadSchema>;
  [EVENT_TYPES.REPLAY_VIEW]: z.infer<typeof replayViewPayloadSchema>;
  [EVENT_TYPES.REPLAY_CLICK]: z.infer<typeof replayClickPayloadSchema>;
  [EVENT_TYPES.CHECKOUT_STARTED]: z.infer<typeof checkoutStartedPayloadSchema>;
  [EVENT_TYPES.PURCHASE_COMPLETED]: z.infer<typeof purchaseCompletedPayloadSchema>;
  [EVENT_TYPES.RESERVATION_CREATED]: z.infer<typeof reservationCreatedPayloadSchema>;
  [EVENT_TYPES.RESERVATION_EXPIRED]: z.infer<typeof reservationExpiredPayloadSchema>;
  [EVENT_TYPES.LINK_IN_BIO_VIEW]: z.infer<typeof linkInBioViewPayloadSchema>;
  [EVENT_TYPES.LINK_IN_BIO_CLICK]: z.infer<typeof linkInBioClickPayloadSchema>;
};

// Typed event helper
export type TypedEvent<T extends EventType> = T extends keyof EventPayloads
  ? BaseEvent<T, EventPayloads[T]>
  : BaseEvent<T, Record<string, unknown>>;
