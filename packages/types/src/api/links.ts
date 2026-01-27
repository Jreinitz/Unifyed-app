import { z } from 'zod';
import { shortLinkSchema, createShortLinkSchema } from '../attribution.js';
import { paginationSchema, uuidSchema } from '../common.js';

// GET /links
export const listLinksQuerySchema = paginationSchema.extend({
  offerId: uuidSchema.optional(),
});

export const listLinksResponseSchema = z.object({
  links: z.array(shortLinkSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// GET /links/:id
export const getLinkParamsSchema = z.object({
  id: uuidSchema,
});

export const getLinkResponseSchema = z.object({
  link: shortLinkSchema,
});

// POST /links
export const createLinkRequestSchema = createShortLinkSchema;
export const createLinkResponseSchema = z.object({
  link: shortLinkSchema,
  url: z.string().url(), // Full URL (e.g., https://app.unifyed.com/go/abc123)
});

// DELETE /links/:id (revoke)
export const revokeLinkParamsSchema = z.object({
  id: uuidSchema,
});
export const revokeLinkResponseSchema = z.object({
  link: shortLinkSchema,
});

export type ListLinksQuery = z.infer<typeof listLinksQuerySchema>;
export type ListLinksResponse = z.infer<typeof listLinksResponseSchema>;
export type GetLinkParams = z.infer<typeof getLinkParamsSchema>;
export type GetLinkResponse = z.infer<typeof getLinkResponseSchema>;
export type CreateLinkRequest = z.infer<typeof createLinkRequestSchema>;
export type CreateLinkResponse = z.infer<typeof createLinkResponseSchema>;
export type RevokeLinkParams = z.infer<typeof revokeLinkParamsSchema>;
export type RevokeLinkResponse = z.infer<typeof revokeLinkResponseSchema>;
