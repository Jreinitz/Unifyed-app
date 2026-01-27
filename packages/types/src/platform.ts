import { z } from 'zod';
import { uuidSchema, timestampsSchema } from './common.js';

// Platform enum
export const platformSchema = z.enum(['shopify', 'tiktok', 'youtube', 'instagram', 'twitch']);
export type Platform = z.infer<typeof platformSchema>;

// Connection status
export const connectionStatusSchema = z.enum(['healthy', 'degraded', 'disconnected', 'pending']);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

// Platform connection
export const platformConnectionSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  platform: platformSchema,
  externalId: z.string().nullable(),
  displayName: z.string().nullable(),
  status: connectionStatusSchema,
  lastSyncAt: z.coerce.date().nullable(),
  lastError: z.string().nullable(),
  tokenExpiresAt: z.coerce.date().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
});

export type PlatformConnection = z.infer<typeof platformConnectionSchema>;

// OAuth callback query params
export const oauthCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
  // Shopify-specific
  shop: z.string().optional(),
  // Error handling
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type OAuthCallback = z.infer<typeof oauthCallbackSchema>;

// Shopify-specific connection metadata
export const shopifyMetadataSchema = z.object({
  shopDomain: z.string(),
  shopName: z.string().optional(),
  shopEmail: z.string().email().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  webhooksRegistered: z.boolean().default(false),
});

export type ShopifyMetadata = z.infer<typeof shopifyMetadataSchema>;

// TikTok-specific connection metadata
export const tiktokMetadataSchema = z.object({
  openId: z.string(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export type TikTokMetadata = z.infer<typeof tiktokMetadataSchema>;

// YouTube-specific connection metadata
export const youtubeMetadataSchema = z.object({
  channelId: z.string(),
  channelTitle: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  subscriberCount: z.number().optional(),
});

export type YouTubeMetadata = z.infer<typeof youtubeMetadataSchema>;

// Twitch-specific connection metadata
export const twitchMetadataSchema = z.object({
  twitchId: z.string(),
  login: z.string(),
  displayName: z.string().optional(),
  profileImageUrl: z.string().url().optional(),
  broadcasterType: z.string().optional(),
});

export type TwitchMetadata = z.infer<typeof twitchMetadataSchema>;
