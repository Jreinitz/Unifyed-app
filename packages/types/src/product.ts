import { z } from 'zod';
import { uuidSchema, timestampsSchema } from './common.js';

// Variant schema
export const variantSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  externalId: z.string(),
  title: z.string(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  price: z.number().int(), // cents
  compareAtPrice: z.number().int().nullable(),
  currency: z.string().length(3),
  inventoryQuantity: z.number().int(),
  inventoryPolicy: z.string(),
  option1: z.string().nullable(),
  option2: z.string().nullable(),
  option3: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  isActive: z.boolean(),
  ...timestampsSchema.shape,
});

export type Variant = z.infer<typeof variantSchema>;

// Product schema
export const productSchema = z.object({
  id: uuidSchema,
  connectionId: uuidSchema,
  externalId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  vendor: z.string().nullable(),
  productType: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  images: z.array(z.string().url()),
  isActive: z.boolean(),
  isArchived: z.boolean(),
  lastSyncedAt: z.coerce.date().nullable(),
  syncVersion: z.number().int(),
  ...timestampsSchema.shape,
});

export type Product = z.infer<typeof productSchema>;

// Product with variants
export const productWithVariantsSchema = productSchema.extend({
  variants: z.array(variantSchema),
});

export type ProductWithVariants = z.infer<typeof productWithVariantsSchema>;

// Product list item (for catalog browsing)
export const productListItemSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  imageUrl: z.string().url().nullable(),
  vendor: z.string().nullable(),
  isActive: z.boolean(),
  variantCount: z.number().int(),
  priceRange: z.object({
    min: z.number().int(),
    max: z.number().int(),
    currency: z.string(),
  }),
});

export type ProductListItem = z.infer<typeof productListItemSchema>;
