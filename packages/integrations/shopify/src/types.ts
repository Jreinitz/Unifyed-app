import { z } from 'zod';

// Shopify OAuth tokens
export const shopifyTokensSchema = z.object({
  accessToken: z.string(),
  scope: z.string().optional(),
});

export type ShopifyTokens = z.infer<typeof shopifyTokensSchema>;

// Shopify shop info
export const shopifyShopSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  domain: z.string(),
  myshopify_domain: z.string(),
  currency: z.string(),
  timezone: z.string(),
});

export type ShopifyShop = z.infer<typeof shopifyShopSchema>;

// Shopify product
export const shopifyProductSchema = z.object({
  id: z.number(),
  title: z.string(),
  body_html: z.string().nullable(),
  vendor: z.string().nullable(),
  product_type: z.string().nullable(),
  handle: z.string(),
  status: z.enum(['active', 'archived', 'draft']),
  images: z.array(z.object({
    id: z.number(),
    src: z.string(),
    position: z.number(),
  })),
  variants: z.array(z.object({
    id: z.number(),
    title: z.string(),
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    price: z.string(),
    compare_at_price: z.string().nullable(),
    inventory_quantity: z.number(),
    inventory_policy: z.string(),
    inventory_item_id: z.number(),
    option1: z.string().nullable(),
    option2: z.string().nullable(),
    option3: z.string().nullable(),
    weight: z.number(),
    weight_unit: z.string(),
    image_id: z.number().nullable(),
  })),
});

export type ShopifyProduct = z.infer<typeof shopifyProductSchema>;

// Shopify order
export const shopifyOrderSchema = z.object({
  id: z.number(),
  order_number: z.number(),
  email: z.string().nullable(),
  total_price: z.string(),
  subtotal_price: z.string(),
  total_discounts: z.string(),
  total_tax: z.string(),
  currency: z.string(),
  financial_status: z.string(),
  fulfillment_status: z.string().nullable(),
  created_at: z.string(),
  note: z.string().nullable(),
  line_items: z.array(z.object({
    id: z.number(),
    variant_id: z.number().nullable(),
    title: z.string(),
    quantity: z.number(),
    price: z.string(),
  })),
  customer: z.object({
    id: z.number(),
    email: z.string().nullable(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
  }).nullable(),
});

export type ShopifyOrder = z.infer<typeof shopifyOrderSchema>;

// Webhook topics
export const SHOPIFY_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'inventory_levels/update',
  'products/create',
  'products/update',
  'products/delete',
  'app/uninstalled',
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];
