import { z } from 'zod';
import { orderSchema } from '../checkout.js';
import { paginationSchema, uuidSchema } from '../common.js';

// GET /go/:code (public - resolve short link and start checkout)
export const resolveShortLinkParamsSchema = z.object({
  code: z.string(),
});

export const resolveShortLinkQuerySchema = z.object({
  visitorId: z.string().optional(),
  variantId: uuidSchema.optional(),
  quantity: z.coerce.number().int().min(1).default(1),
});

// Response is a redirect to Shopify checkout

// GET /orders
export const listOrdersQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'confirmed', 'fulfilled', 'cancelled', 'refunded']).optional(),
});

export const listOrdersResponseSchema = z.object({
  orders: z.array(orderSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// GET /orders/:id
export const getOrderParamsSchema = z.object({
  id: uuidSchema,
});

export const getOrderResponseSchema = z.object({
  order: orderSchema,
});

// POST /webhooks/shopify/orders (Shopify webhook)
export const shopifyOrderWebhookHeadersSchema = z.object({
  'x-shopify-hmac-sha256': z.string(),
  'x-shopify-shop-domain': z.string(),
  'x-shopify-topic': z.string(),
  'x-shopify-webhook-id': z.string(),
});

export type ResolveShortLinkParams = z.infer<typeof resolveShortLinkParamsSchema>;
export type ResolveShortLinkQuery = z.infer<typeof resolveShortLinkQuerySchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type ListOrdersResponse = z.infer<typeof listOrdersResponseSchema>;
export type GetOrderParams = z.infer<typeof getOrderParamsSchema>;
export type GetOrderResponse = z.infer<typeof getOrderResponseSchema>;
export type ShopifyOrderWebhookHeaders = z.infer<typeof shopifyOrderWebhookHeadersSchema>;
