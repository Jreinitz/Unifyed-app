import { z } from 'zod';
import { productWithVariantsSchema, productListItemSchema } from '../product.js';
import { paginationSchema, uuidSchema } from '../common.js';

// GET /catalog/products
export const listProductsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  connectionId: uuidSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export const listProductsResponseSchema = z.object({
  products: z.array(productListItemSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// GET /catalog/products/:id
export const getProductParamsSchema = z.object({
  id: uuidSchema,
});

export const getProductResponseSchema = z.object({
  product: productWithVariantsSchema,
});

// POST /catalog/sync (trigger sync for a connection)
export const syncCatalogRequestSchema = z.object({
  connectionId: uuidSchema,
});

export const syncCatalogResponseSchema = z.object({
  jobId: z.string(),
  message: z.string(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ListProductsResponse = z.infer<typeof listProductsResponseSchema>;
export type GetProductParams = z.infer<typeof getProductParamsSchema>;
export type GetProductResponse = z.infer<typeof getProductResponseSchema>;
export type SyncCatalogRequest = z.infer<typeof syncCatalogRequestSchema>;
export type SyncCatalogResponse = z.infer<typeof syncCatalogResponseSchema>;
