import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { creators, sessions } from '@unifyed/db/schema';
import { 
  signupRequestSchema, 
  loginRequestSchema,
  type SignupResponse,
  type LoginResponse,
  type MeResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes, generateId } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';

const SESSION_DURATION_DAYS = 30;

export async function authRoutes(fastify: FastifyInstance) {
  // Register auth plugin for protected routes
  await fastify.register(authPlugin);

  // POST /auth/signup
  fastify.post('/signup', async (request, reply) => {
    const input = signupRequestSchema.parse(request.body);

    // Check if email already exists
    const existing = await fastify.db
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.email, input.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(ErrorCodes.ALREADY_EXISTS, 'Email already registered');
    }

    // Check handle uniqueness if provided
    if (input.handle) {
      const existingHandle = await fastify.db
        .select({ id: creators.id })
        .from(creators)
        .where(eq(creators.handle, input.handle.toLowerCase()))
        .limit(1);

      if (existingHandle.length > 0) {
        throw new AppError(ErrorCodes.ALREADY_EXISTS, 'Handle already taken');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, 12);

    // Create creator
    const [creator] = await fastify.db
      .insert(creators)
      .values({
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name,
        handle: input.handle?.toLowerCase(),
      })
      .returning();

    if (!creator) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create creator');
    }

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    const [session] = await fastify.db
      .insert(sessions)
      .values({
        creatorId: creator.id,
        token: generateId(32),
        expiresAt,
      })
      .returning();

    if (!session) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create session');
    }

    // Generate JWT
    const token = fastify.jwt.sign(
      { creatorId: creator.id, sessionId: session.id },
      { expiresIn: `${SESSION_DURATION_DAYS}d` }
    );

    const response: SignupResponse = {
      token,
      expiresAt: session.expiresAt,
      creator: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
        handle: creator.handle,
        avatarUrl: creator.avatarUrl,
        isActive: creator.isActive,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt,
      },
    };

    return reply.status(201).send(response);
  });

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);

    // Find creator by email
    const [creator] = await fastify.db
      .select()
      .from(creators)
      .where(eq(creators.email, input.email.toLowerCase()))
      .limit(1);

    if (!creator) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Verify password
    const validPassword = await bcrypt.compare(input.password, creator.passwordHash);
    if (!validPassword) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Check if active
    if (!creator.isActive) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Account is disabled');
    }

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    const [session] = await fastify.db
      .insert(sessions)
      .values({
        creatorId: creator.id,
        token: generateId(32),
        expiresAt,
      })
      .returning();

    if (!session) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create session');
    }

    // Generate JWT
    const token = fastify.jwt.sign(
      { creatorId: creator.id, sessionId: session.id },
      { expiresIn: `${SESSION_DURATION_DAYS}d` }
    );

    const response: LoginResponse = {
      token,
      expiresAt: session.expiresAt,
      creator: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
        handle: creator.handle,
        avatarUrl: creator.avatarUrl,
        isActive: creator.isActive,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt,
      },
    };

    return reply.send(response);
  });

  // GET /auth/me (protected)
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const [creator] = await fastify.db
      .select()
      .from(creators)
      .where(eq(creators.id, request.creator.id))
      .limit(1);

    if (!creator) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Creator not found');
    }

    const response: MeResponse = {
      creator: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
        handle: creator.handle,
        avatarUrl: creator.avatarUrl,
        isActive: creator.isActive,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt,
      },
    };

    return reply.send(response);
  });

  // POST /auth/logout (protected)
  fastify.post('/logout', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    // Delete current session
    await fastify.db
      .delete(sessions)
      .where(eq(sessions.id, request.user.sessionId));

    return reply.send({ success: true });
  });
}
