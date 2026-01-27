import { z } from 'zod';
import { uuidSchema, timestampsSchema } from './common.js';

// Offer type
export const offerTypeSchema = z.enum([
  'percentage_off',
  'fixed_amount_off',
  'fixed_price',
  'bundle',
]);
export type OfferType = z.infer<typeof offerTypeSchema>;

// Offer status
export const offerStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'expired',
  'archived',
]);
export type OfferStatus = z.infer<typeof offerStatusSchema>;

// Offer product (junction)
export const offerProductSchema = z.object({
  id: uuidSchema,
  offerId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  overrideValue: z.number().int().nullable(),
  sortOrder: z.number().int(),
});

export type OfferProduct = z.infer<typeof offerProductSchema>;

// Offer schema
export const offerSchema = z.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  type: offerTypeSchema,
  value: z.number().int(),
  status: offerStatusSchema,
  startsAt: z.coerce.date().nullable(),
  endsAt: z.coerce.date().nullable(),
  maxRedemptions: z.number().int().nullable(),
  currentRedemptions: z.number().int(),
  maxPerCustomer: z.number().int().nullable(),
  badgeText: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
});

export type Offer = z.infer<typeof offerSchema>;

// Offer with products
export const offerWithProductsSchema = offerSchema.extend({
  products: z.array(offerProductSchema),
});

export type OfferWithProducts = z.infer<typeof offerWithProductsSchema>;

// Create offer input
export const createOfferSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  type: offerTypeSchema,
  value: z.number().int().min(0),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  maxPerCustomer: z.number().int().min(1).optional(),
  badgeText: z.string().max(50).optional(),
  productIds: z.array(uuidSchema).min(1),
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

// Update offer input
export const updateOfferSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  value: z.number().int().min(0).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  maxPerCustomer: z.number().int().min(1).nullable().optional(),
  badgeText: z.string().max(50).nullable().optional(),
});

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
