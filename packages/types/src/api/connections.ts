import { z } from 'zod';
import { platformConnectionSchema, platformSchema, oauthCallbackSchema } from '../platform.js';
import { uuidSchema } from '../common.js';

// GET /connections
export const listConnectionsResponseSchema = z.object({
  connections: z.array(platformConnectionSchema),
});

// GET /connections/:platform/auth-url
export const getAuthUrlParamsSchema = z.object({
  platform: platformSchema,
});

export const getAuthUrlQuerySchema = z.object({
  shop: z.string().optional(), // Required for Shopify
});

export const getAuthUrlResponseSchema = z.object({
  authUrl: z.string().url(),
  state: z.string(),
});

// GET /connections/:platform/callback
export const oauthCallbackParamsSchema = z.object({
  platform: platformSchema,
});

export const oauthCallbackQuerySchema = oauthCallbackSchema;

export const oauthCallbackResponseSchema = z.object({
  connection: platformConnectionSchema,
  redirectUrl: z.string().url(),
});

// DELETE /connections/:id
export const deleteConnectionParamsSchema = z.object({
  id: uuidSchema,
});

export const deleteConnectionResponseSchema = z.object({
  success: z.literal(true),
});

export type ListConnectionsResponse = z.infer<typeof listConnectionsResponseSchema>;
export type GetAuthUrlParams = z.infer<typeof getAuthUrlParamsSchema>;
export type GetAuthUrlQuery = z.infer<typeof getAuthUrlQuerySchema>;
export type GetAuthUrlResponse = z.infer<typeof getAuthUrlResponseSchema>;
export type OAuthCallbackParams = z.infer<typeof oauthCallbackParamsSchema>;
export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
export type OAuthCallbackResponse = z.infer<typeof oauthCallbackResponseSchema>;
export type DeleteConnectionParams = z.infer<typeof deleteConnectionParamsSchema>;
export type DeleteConnectionResponse = z.infer<typeof deleteConnectionResponseSchema>;
