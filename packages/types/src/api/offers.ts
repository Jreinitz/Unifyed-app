import { z } from 'zod';
import { offerSchema, offerWithProductsSchema, createOfferSchema, updateOfferSchema } from '../offer.js';
import { paginationSchema, uuidSchema } from '../common.js';

// GET /offers
export const listOffersQuerySchema = paginationSchema.extend({
  status: z.enum(['draft', 'active', 'paused', 'expired', 'archived']).optional(),
});

export const listOffersResponseSchema = z.object({
  offers: z.array(offerSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// GET /offers/:id
export const getOfferParamsSchema = z.object({
  id: uuidSchema,
});

export const getOfferResponseSchema = z.object({
  offer: offerWithProductsSchema,
});

// POST /offers
export const createOfferRequestSchema = createOfferSchema;
export const createOfferResponseSchema = z.object({
  offer: offerWithProductsSchema,
});

// PATCH /offers/:id
export const updateOfferParamsSchema = z.object({
  id: uuidSchema,
});
export const updateOfferRequestSchema = updateOfferSchema;
export const updateOfferResponseSchema = z.object({
  offer: offerWithProductsSchema,
});

// POST /offers/:id/activate
export const activateOfferParamsSchema = z.object({
  id: uuidSchema,
});
export const activateOfferResponseSchema = z.object({
  offer: offerSchema,
});

// POST /offers/:id/deactivate
export const deactivateOfferParamsSchema = z.object({
  id: uuidSchema,
});
export const deactivateOfferResponseSchema = z.object({
  offer: offerSchema,
});

// DELETE /offers/:id
export const deleteOfferParamsSchema = z.object({
  id: uuidSchema,
});
export const deleteOfferResponseSchema = z.object({
  success: z.literal(true),
});

export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;
export type ListOffersResponse = z.infer<typeof listOffersResponseSchema>;
export type GetOfferParams = z.infer<typeof getOfferParamsSchema>;
export type GetOfferResponse = z.infer<typeof getOfferResponseSchema>;
export type CreateOfferRequest = z.infer<typeof createOfferRequestSchema>;
export type CreateOfferResponse = z.infer<typeof createOfferResponseSchema>;
export type UpdateOfferParams = z.infer<typeof updateOfferParamsSchema>;
export type UpdateOfferRequest = z.infer<typeof updateOfferRequestSchema>;
export type UpdateOfferResponse = z.infer<typeof updateOfferResponseSchema>;
export type ActivateOfferParams = z.infer<typeof activateOfferParamsSchema>;
export type ActivateOfferResponse = z.infer<typeof activateOfferResponseSchema>;
export type DeactivateOfferParams = z.infer<typeof deactivateOfferParamsSchema>;
export type DeactivateOfferResponse = z.infer<typeof deactivateOfferResponseSchema>;
export type DeleteOfferParams = z.infer<typeof deleteOfferParamsSchema>;
export type DeleteOfferResponse = z.infer<typeof deleteOfferResponseSchema>;
