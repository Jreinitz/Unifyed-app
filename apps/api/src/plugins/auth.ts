import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import { profiles } from '@unifyed/db/schema';
import { unauthorized } from '@unifyed/utils';
import { verifySupabaseToken } from '../lib/supabase.js';

declare module 'fastify' {
  interface FastifyRequest {
    creator: {
      id: string;
      email: string;
      name: string;
      handle: string | null;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // Support both Supabase JWT format and legacy format
    payload: { sub: string; email: string } | { creatorId: string; sessionId: string };
    user: { sub: string; email: string; sessionId?: string };
  }
}

async function authPluginCallback(fastify: FastifyInstance) {
  /**
   * Authentication hook - verifies Supabase JWT and loads creator profile
   */
  fastify.decorate('authenticate', async function (
    request: FastifyRequest,
    _reply: FastifyReply
  ) {
    // Get token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorized('Missing authorization token');
    }
    
    const token = authHeader.substring(7);
    
    // Verify with Supabase
    const user = await verifySupabaseToken(token);
    if (!user) {
      throw unauthorized('Invalid or expired token');
    }

    // Load profile from our profiles table
    const [profile] = await fastify.db
      .select({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        handle: profiles.handle,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    if (!profile) {
      // Profile doesn't exist yet - create it
      const [newProfile] = await fastify.db
        .insert(profiles)
        .values({
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.['name'] || user.user_metadata?.['full_name'] || 'Creator',
          isActive: true,
        })
        .returning({
          id: profiles.id,
          email: profiles.email,
          name: profiles.name,
          handle: profiles.handle,
        });
      
      if (!newProfile) {
        throw unauthorized('Failed to create profile');
      }
      
      request.creator = {
        id: newProfile.id,
        email: newProfile.email,
        name: newProfile.name || 'Creator',
        handle: newProfile.handle,
      };
    } else {
      request.creator = {
        id: profile.id,
        email: profile.email,
        name: profile.name || 'Creator',
        handle: profile.handle,
      };
    }
  });
}

export const authPlugin = fp(authPluginCallback, {
  name: 'auth',
  dependencies: ['db'],
});

// Type augmentation for authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
