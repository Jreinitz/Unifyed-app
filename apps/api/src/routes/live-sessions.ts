import { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { liveSessions, streams, platformConnections } from '@unifyed/db/schema';
import { z } from 'zod';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';
import * as restreamIntegration from '@unifyed/integrations-restream';

// Request/Response schemas
const listLiveSessionsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['preparing', 'live', 'ending', 'ended']).optional(),
});

const getLiveSessionParamsSchema = z.object({
  id: z.string().uuid(),
});

// Response types
interface LiveSessionResponse {
  id: string;
  creatorId: string;
  title: string | null;
  status: 'preparing' | 'live' | 'ending' | 'ended';
  startedAt: Date | null;
  endedAt: Date | null;
  totalPeakViewers: number | null;
  viewsByPlatform: Record<string, number> | null;
  streams: Array<{
    id: string;
    platform: string | null;
    status: string;
    title: string | null;
    peakViewers: number | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

interface LiveStatusResponse {
  isLive: boolean;
  session: LiveSessionResponse | null;
  restreamConnected: boolean;
  directPlatforms: Array<{
    platform: string;
    connected: boolean;
    displayName: string | null;
  }>;
}

export async function liveSessionsRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /live-sessions - List live sessions
  fastify.get('/', async (request, reply) => {
    const query = listLiveSessionsQuerySchema.parse(request.query);
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(liveSessions.creatorId, request.creator.id)];
    if (status) {
      conditions.push(eq(liveSessions.status, status));
    }

    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(liveSessions)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const sessionList = await fastify.db
      .select()
      .from(liveSessions)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(liveSessions.createdAt));

    return reply.send({
      sessions: sessionList.map(s => ({
        ...s,
        viewsByPlatform: s.viewsByPlatform as Record<string, number> | null,
        metadata: s.metadata as Record<string, unknown> | null,
      })),
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    });
  });

  // GET /live-sessions/status - Get current live status
  fastify.get('/status', async (request, reply) => {
    // Check for active live session
    const [currentSession] = await fastify.db
      .select()
      .from(liveSessions)
      .where(and(
        eq(liveSessions.creatorId, request.creator.id),
        eq(liveSessions.status, 'live')
      ))
      .limit(1);

    // Get streams for the session
    let sessionStreams: Array<{
      id: string;
      platform: string | null;
      status: string;
      title: string | null;
      peakViewers: number | null;
    }> = [];

    if (currentSession) {
      const streamList = await fastify.db
        .select({
          id: streams.id,
          platform: streams.platform,
          status: streams.status,
          title: streams.title,
          peakViewers: streams.peakViewers,
        })
        .from(streams)
        .where(eq(streams.liveSessionId, currentSession.id));
      
      sessionStreams = streamList;
    }

    // Check Restream connection
    const restreamConn = await fastify.db.query.streamingToolConnections.findFirst({
      where: (t, { eq, and }) => and(
        eq(t.creatorId, request.creator.id),
        eq(t.tool, 'restream'),
        eq(t.status, 'connected')
      ),
    });

    // Check direct platform connections
    const platformConns = await fastify.db
      .select({
        platform: platformConnections.platform,
        status: platformConnections.status,
        displayName: platformConnections.displayName,
      })
      .from(platformConnections)
      .where(eq(platformConnections.creatorId, request.creator.id));

    const directPlatforms = platformConns
      .filter(p => ['youtube', 'twitch', 'tiktok'].includes(p.platform))
      .map(p => ({
        platform: p.platform,
        connected: p.status === 'healthy',
        displayName: p.displayName,
      }));

    const response: LiveStatusResponse = {
      isLive: !!currentSession,
      session: currentSession ? {
        id: currentSession.id,
        creatorId: currentSession.creatorId,
        title: currentSession.title,
        status: currentSession.status,
        startedAt: currentSession.startedAt,
        endedAt: currentSession.endedAt,
        totalPeakViewers: currentSession.totalPeakViewers,
        viewsByPlatform: currentSession.viewsByPlatform as Record<string, number> | null,
        streams: sessionStreams,
        createdAt: currentSession.createdAt,
        updatedAt: currentSession.updatedAt,
      } : null,
      restreamConnected: !!restreamConn,
      directPlatforms,
    };

    return reply.send(response);
  });

  // GET /live-sessions/:id - Get single live session
  fastify.get('/:id', async (request, reply) => {
    const { id } = getLiveSessionParamsSchema.parse(request.params);

    const [session] = await fastify.db
      .select()
      .from(liveSessions)
      .where(and(
        eq(liveSessions.id, id),
        eq(liveSessions.creatorId, request.creator.id)
      ))
      .limit(1);

    if (!session) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Live session not found');
    }

    // Get streams for the session
    const sessionStreams = await fastify.db
      .select({
        id: streams.id,
        platform: streams.platform,
        status: streams.status,
        title: streams.title,
        peakViewers: streams.peakViewers,
      })
      .from(streams)
      .where(eq(streams.liveSessionId, session.id));

    const response: LiveSessionResponse = {
      id: session.id,
      creatorId: session.creatorId,
      title: session.title,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      totalPeakViewers: session.totalPeakViewers,
      viewsByPlatform: session.viewsByPlatform as Record<string, number> | null,
      streams: sessionStreams,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };

    return reply.send({ session: response });
  });

  // POST /live-sessions/check - Manually trigger live status check
  fastify.post('/check', async (request, reply) => {
    // Check Restream connection first (most efficient)
    const restreamConn = await fastify.db.query.streamingToolConnections.findFirst({
      where: (t, { eq, and }) => and(
        eq(t.creatorId, request.creator.id),
        eq(t.tool, 'restream'),
        eq(t.status, 'connected')
      ),
    });

    if (restreamConn) {
      try {
        // Decrypt credentials (in production, use proper encryption)
        let credentials: { accessToken: string };
        try {
          credentials = JSON.parse(
            Buffer.from(restreamConn.credentials, 'base64').toString('utf-8')
          );
        } catch {
          credentials = JSON.parse(restreamConn.credentials);
        }

        const { isLive, broadcast } = await restreamIntegration.checkLiveStatus(
          credentials.accessToken
        );

        return reply.send({
          checked: true,
          source: 'restream',
          isLive,
          broadcast: broadcast ? {
            id: broadcast.id,
            title: broadcast.title,
            status: broadcast.status,
            channels: broadcast.channels.filter((ch: { active: boolean }) => ch.active).map((ch: { platform: string; name: string }) => ({
              platform: ch.platform,
              name: ch.name,
            })),
          } : null,
        });
      } catch (error) {
        // Log error but continue to check direct platforms
        console.error('Restream check failed:', error);
      }
    }

    // Return status of what connections are available
    const platformConns = await fastify.db
      .select()
      .from(platformConnections)
      .where(and(
        eq(platformConnections.creatorId, request.creator.id),
        eq(platformConnections.status, 'healthy')
      ));

    const streamingPlatforms = platformConns
      .filter(p => ['youtube', 'twitch', 'tiktok'].includes(p.platform));

    return reply.send({
      checked: true,
      source: 'direct',
      isLive: false, // Would need to check each platform
      platforms: streamingPlatforms.map(p => ({
        platform: p.platform,
        displayName: p.displayName,
      })),
      message: 'Direct platform checking happens via background worker',
    });
  });

  // GET /live-sessions/restream-settings - Get Restream ingest settings for OBS
  fastify.get('/restream-settings', async (request, reply) => {
    const restreamConn = await fastify.db.query.streamingToolConnections.findFirst({
      where: (t, { eq, and }) => and(
        eq(t.creatorId, request.creator.id),
        eq(t.tool, 'restream'),
        eq(t.status, 'connected')
      ),
    });

    if (!restreamConn) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Restream not connected');
    }

    try {
      let credentials: { accessToken: string };
      try {
        credentials = JSON.parse(
          Buffer.from(restreamConn.credentials, 'base64').toString('utf-8')
        );
      } catch {
        credentials = JSON.parse(restreamConn.credentials);
      }

      const settings = await restreamIntegration.getIngestSettings(
        credentials.accessToken
      );

      // Get configured platforms
      const channels = await restreamIntegration.getChannels(
        credentials.accessToken
      );

      const enabledChannels = channels.filter((ch: { enabled: boolean; connected: boolean }) => ch.enabled && ch.connected);

      return reply.send({
        rtmpUrl: settings.rtmpUrl,
        streamKey: settings.streamKey,
        platforms: enabledChannels.map((ch: { platform: string; displayName: string }) => ({
          platform: ch.platform,
          displayName: ch.displayName,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new AppError(ErrorCodes.INTEGRATION_ERROR, `Failed to get Restream settings: ${message}`);
    }
  });
}
