import { z } from 'zod';
import { uuidSchema, timestampsSchema } from './common.js';

// Creator schema
export const creatorSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string().min(1).max(255),
  handle: z.string().min(3).max(100).regex(/^[a-z0-9_-]+$/i).nullable(),
  avatarUrl: z.string().url().nullable(),
  isActive: z.boolean(),
  ...timestampsSchema.shape,
});

export type Creator = z.infer<typeof creatorSchema>;

// Create creator input
export const createCreatorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(255),
  handle: z.string().min(3).max(100).regex(/^[a-z0-9_-]+$/i).optional(),
});

export type CreateCreatorInput = z.infer<typeof createCreatorSchema>;

// Login input
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Auth response
export const authResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.coerce.date(),
  creator: creatorSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Update creator input
export const updateCreatorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  handle: z.string().min(3).max(100).regex(/^[a-z0-9_-]+$/i).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type UpdateCreatorInput = z.infer<typeof updateCreatorSchema>;
