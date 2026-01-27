import { z } from 'zod';
import { creatorSchema, createCreatorSchema, loginSchema, authResponseSchema } from '../creator.js';

// POST /auth/signup
export const signupRequestSchema = createCreatorSchema;
export const signupResponseSchema = authResponseSchema;

// POST /auth/login
export const loginRequestSchema = loginSchema;
export const loginResponseSchema = authResponseSchema;

// GET /auth/me
export const meResponseSchema = z.object({
  creator: creatorSchema,
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type SignupResponse = z.infer<typeof signupResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
