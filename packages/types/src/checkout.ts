import { z } from 'zod';
import { uuidSchema, timestampsSchema } from './common.js';

// Checkout status
export const checkoutStatusSchema = z.enum([
  'pending',
  'redirected',
  'completed',
  'abandoned',
  'failed',
]);
export type CheckoutStatus = z.infer<typeof checkoutStatusSchema>;

// Order status
export const orderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'fulfilled',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// Cart item
export const cartItemSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().min(1),
  price: z.number().int(),
  offerPrice: z.number().int().optional(),
});

export type CartItem = z.infer<typeof cartItemSchema>;

// Checkout session
export const checkoutSessionSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  idempotencyKey: z.string(),
  shortLinkId: uuidSchema.nullable(),
  attributionContextId: uuidSchema,
  offerId: uuidSchema.nullable(),
  connectionId: uuidSchema,
  externalCheckoutId: z.string().nullable(),
  externalCheckoutUrl: z.string().url().nullable(),
  status: checkoutStatusSchema,
  cartItems: z.array(cartItemSchema),
  subtotal: z.number().int(),
  discount: z.number().int(),
  total: z.number().int(),
  currency: z.string().length(3),
  visitorId: z.string().nullable(),
  redirectedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date(),
  ...timestampsSchema.shape,
});

export type CheckoutSession = z.infer<typeof checkoutSessionSchema>;

// Order line item
export const orderLineItemSchema = z.object({
  variantId: z.string(),
  externalVariantId: z.string(),
  title: z.string(),
  quantity: z.number().int(),
  price: z.number().int(),
});

export type OrderLineItem = z.infer<typeof orderLineItemSchema>;

// Order
export const orderSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  checkoutSessionId: uuidSchema.nullable(),
  attributionContextId: uuidSchema.nullable(),
  connectionId: uuidSchema,
  externalOrderId: z.string(),
  externalOrderNumber: z.string().nullable(),
  status: orderStatusSchema,
  subtotal: z.number().int(),
  discount: z.number().int(),
  shipping: z.number().int(),
  tax: z.number().int(),
  total: z.number().int(),
  currency: z.string().length(3),
  customerEmail: z.string().email().nullable(),
  customerName: z.string().nullable(),
  lineItems: z.array(orderLineItemSchema).nullable(),
  externalCreatedAt: z.coerce.date().nullable(),
  ...timestampsSchema.shape,
});

export type Order = z.infer<typeof orderSchema>;

// Checkout start input (from clicking a short link)
export const checkoutStartSchema = z.object({
  code: z.string(), // short link code
  visitorId: z.string().optional(),
  variantId: uuidSchema.optional(), // if specific variant selected
  quantity: z.number().int().min(1).default(1),
});

export type CheckoutStartInput = z.infer<typeof checkoutStartSchema>;

// Checkout start response
export const checkoutStartResponseSchema = z.object({
  checkoutSessionId: uuidSchema,
  checkoutUrl: z.string().url(),
  expiresAt: z.coerce.date(),
});

export type CheckoutStartResponse = z.infer<typeof checkoutStartResponseSchema>;
