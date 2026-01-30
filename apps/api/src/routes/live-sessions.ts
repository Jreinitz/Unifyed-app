import { FastifyInstance } from 'fastify';
import { eq, and, count, desc, inArray, sum } from 'drizzle-orm';
import { liveSessions, streams, platformConnections, sessionTemplates, offers, products, orders, checkoutSessions, attributionContexts } from '@unifyed/db/schema';
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

  // POST /live-sessions/prepare - Prepare a new session
  const prepareSessionBodySchema = z.object({
    title: z.string().optional(),
    templateId: z.string().uuid().optional(),
    platforms: z.array(z.string()).optional(),
    offerIds: z.array(z.string().uuid()).optional(),
    productIds: z.array(z.string().uuid()).optional(),
  });

  fastify.post('/prepare', async (request, reply) => {
    const body = prepareSessionBodySchema.parse(request.body);

    let sessionTitle = body.title;
    let metadata: Record<string, unknown> = {};

    // If template is specified, load its settings
    if (body.templateId) {
      const [template] = await fastify.db
        .select()
        .from(sessionTemplates)
        .where(and(
          eq(sessionTemplates.id, body.templateId),
          eq(sessionTemplates.creatorId, request.creator.id)
        ))
        .limit(1);

      if (!template) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Template not found');
      }

      const templateSettings = template.settings as { defaultTitle?: string } | null;
      sessionTitle = body.title || templateSettings?.defaultTitle || template.name;
      metadata = {
        templateId: template.id,
        templateName: template.name,
        platforms: body.platforms || template.platforms,
        offerIds: body.offerIds || template.defaultOfferIds,
        productIds: body.productIds || template.defaultProductIds,
        settings: template.settings,
      };
    } else {
      metadata = {
        platforms: body.platforms,
        offerIds: body.offerIds,
        productIds: body.productIds,
      };
    }

    // Create session in preparing status
    const [session] = await fastify.db
      .insert(liveSessions)
      .values({
        creatorId: request.creator.id,
        title: sessionTitle,
        status: 'preparing',
        metadata,
      })
      .returning();

    if (!session) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create session');
    }

    return reply.status(201).send({
      session: {
        id: session.id,
        creatorId: session.creatorId,
        title: session.title,
        status: session.status,
        metadata: session.metadata,
        createdAt: session.createdAt,
      },
    });
  });

  // GET /live-sessions/:id/checklist - Get preparation checklist for a session
  fastify.get('/:id/checklist', async (request, reply) => {
    const { id } = getLiveSessionParamsSchema.parse(request.params);

    // Get the session
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

    const metadata = session.metadata as {
      platforms?: string[];
      offerIds?: string[];
      productIds?: string[];
    } | null;

    // Check platforms connection status
    const platformConns = await fastify.db
      .select({
        platform: platformConnections.platform,
        status: platformConnections.status,
        displayName: platformConnections.displayName,
      })
      .from(platformConnections)
      .where(eq(platformConnections.creatorId, request.creator.id));

    const connectedPlatforms = platformConns
      .filter(p => p.status === 'healthy')
      .map(p => p.platform);

    // Check Restream
    const restreamConn = await fastify.db.query.streamingToolConnections.findFirst({
      where: (t, { eq, and }) => and(
        eq(t.creatorId, request.creator.id),
        eq(t.tool, 'restream'),
        eq(t.status, 'connected')
      ),
    });

    // Check offers
    let offersStatus: { ready: boolean; items: Array<{ id: string; name: string; status: string }> } = { ready: true, items: [] };
    if (metadata?.offerIds && metadata.offerIds.length > 0) {
      const offerList = await fastify.db
        .select({ id: offers.id, name: offers.name, status: offers.status })
        .from(offers)
        .where(and(
          inArray(offers.id, metadata.offerIds),
          eq(offers.creatorId, request.creator.id)
        ));

      const activeOffers = offerList.filter(o => o.status === 'active');
      offersStatus = {
        ready: activeOffers.length === metadata.offerIds.length,
        items: offerList.map(o => ({ id: o.id, name: o.name, status: o.status })),
      };
    }

    // Check products (products are linked via connectionId to platformConnections)
    let productsStatus: { ready: boolean; count: number } = { ready: true, count: 0 };
    if (metadata?.productIds && metadata.productIds.length > 0) {
      const productList = await fastify.db
        .select({ id: products.id })
        .from(products)
        .innerJoin(platformConnections, eq(products.connectionId, platformConnections.id))
        .where(and(
          inArray(products.id, metadata.productIds),
          eq(platformConnections.creatorId, request.creator.id)
        ));

      productsStatus = {
        ready: productList.length === metadata.productIds.length,
        count: productList.length,
      };
    }

    // Build checklist
    const targetPlatforms = metadata?.platforms || [];
    const connectedPlatformStrings = connectedPlatforms.map(p => String(p));
    const platformsConnected = targetPlatforms.length === 0 || 
      targetPlatforms.every(p => connectedPlatformStrings.includes(p));

    const checklist = {
      platforms: {
        status: platformsConnected ? 'ready' : 'warning',
        message: platformsConnected 
          ? `${connectedPlatforms.length} platform(s) connected`
          : `Some platforms not connected`,
        details: {
          target: targetPlatforms,
          connected: connectedPlatformStrings,
          missing: targetPlatforms.filter(p => !connectedPlatformStrings.includes(p)),
        },
      },
      streaming: {
        status: restreamConn ? 'ready' : connectedPlatforms.length > 0 ? 'ready' : 'error',
        message: restreamConn 
          ? 'Restream connected - ready to multistream'
          : connectedPlatforms.length > 0
            ? 'Direct platform connections available'
            : 'No streaming setup available',
        hasRestream: !!restreamConn,
      },
      offers: {
        status: offersStatus.ready ? 'ready' : 'warning',
        message: offersStatus.items.length === 0
          ? 'No offers selected'
          : offersStatus.ready
            ? `${offersStatus.items.length} offer(s) ready`
            : 'Some offers not active',
        items: offersStatus.items,
      },
      products: {
        status: productsStatus.ready ? 'ready' : 'warning',
        message: productsStatus.count === 0
          ? 'No products selected'
          : `${productsStatus.count} product(s) selected`,
        count: productsStatus.count,
      },
      overall: {
        ready: platformsConnected && (!!restreamConn || connectedPlatforms.length > 0),
        warnings: [
          !platformsConnected ? 'Some platforms not connected' : null,
          !offersStatus.ready && offersStatus.items.length > 0 ? 'Some offers not active' : null,
        ].filter(Boolean),
      },
    };

    return reply.send({
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
      },
      checklist,
    });
  });

  // GET /live-sessions/:id/stats - Get real-time session statistics
  fastify.get('/:id/stats', async (request, reply) => {
    const { id } = getLiveSessionParamsSchema.parse(request.params);

    // Get the session
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

    // Get orders attributed to this session
    const orderStats = await fastify.db
      .select({
        orderCount: count(orders.id),
        totalRevenue: sum(orders.total),
      })
      .from(orders)
      .innerJoin(attributionContexts, eq(orders.attributionContextId, attributionContexts.id))
      .where(eq(attributionContexts.liveSessionId, id));

    // Get checkout sessions for conversion rate
    const checkoutStats = await fastify.db
      .select({
        checkoutCount: count(checkoutSessions.id),
      })
      .from(checkoutSessions)
      .innerJoin(attributionContexts, eq(checkoutSessions.attributionContextId, attributionContexts.id))
      .where(eq(attributionContexts.liveSessionId, id));

    const orderCount = Number(orderStats[0]?.orderCount || 0);
    const totalRevenue = Number(orderStats[0]?.totalRevenue || 0);
    const checkoutCount = Number(checkoutStats[0]?.checkoutCount || 0);
    const conversionRate = checkoutCount > 0 ? (orderCount / checkoutCount) * 100 : 0;

    // Calculate duration
    let duration = 0;
    if (session.startedAt) {
      const endTime = session.endedAt ? new Date(session.endedAt) : new Date();
      duration = Math.floor((endTime.getTime() - new Date(session.startedAt).getTime()) / 1000);
    }

    // Get platform breakdown from session
    const viewsByPlatform = session.viewsByPlatform as Record<string, number> | null;

    return reply.send({
      sessionId: session.id,
      title: session.title,
      status: session.status,
      startedAt: session.startedAt,
      duration, // in seconds
      stats: {
        revenue: totalRevenue,
        orders: orderCount,
        checkouts: checkoutCount,
        conversionRate: Math.round(conversionRate * 10) / 10,
        totalViewers: session.totalViews || 0,
        peakViewers: session.totalPeakViewers || 0,
        viewsByPlatform: viewsByPlatform || {},
      },
    });
  });

  // GET /live-sessions/current/stats - Get stats for currently live session
  fastify.get('/current/stats', async (request, reply) => {
    // Find currently live session
    const [session] = await fastify.db
      .select()
      .from(liveSessions)
      .where(and(
        eq(liveSessions.creatorId, request.creator.id),
        eq(liveSessions.status, 'live')
      ))
      .limit(1);

    if (!session) {
      return reply.send({
        isLive: false,
        stats: null,
      });
    }

    // Get orders attributed to this session
    const orderStats = await fastify.db
      .select({
        orderCount: count(orders.id),
        totalRevenue: sum(orders.total),
      })
      .from(orders)
      .innerJoin(attributionContexts, eq(orders.attributionContextId, attributionContexts.id))
      .where(eq(attributionContexts.liveSessionId, session.id));

    // Get checkout sessions for conversion rate
    const checkoutStats = await fastify.db
      .select({
        checkoutCount: count(checkoutSessions.id),
      })
      .from(checkoutSessions)
      .innerJoin(attributionContexts, eq(checkoutSessions.attributionContextId, attributionContexts.id))
      .where(eq(attributionContexts.liveSessionId, session.id));

    const orderCount = Number(orderStats[0]?.orderCount || 0);
    const totalRevenue = Number(orderStats[0]?.totalRevenue || 0);
    const checkoutCount = Number(checkoutStats[0]?.checkoutCount || 0);
    const conversionRate = checkoutCount > 0 ? (orderCount / checkoutCount) * 100 : 0;

    // Calculate duration
    let duration = 0;
    if (session.startedAt) {
      duration = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    }

    const viewsByPlatform = session.viewsByPlatform as Record<string, number> | null;

    return reply.send({
      isLive: true,
      sessionId: session.id,
      title: session.title,
      startedAt: session.startedAt,
      duration,
      stats: {
        revenue: totalRevenue,
        orders: orderCount,
        checkouts: checkoutCount,
        conversionRate: Math.round(conversionRate * 10) / 10,
        totalViewers: session.totalViews || 0,
        peakViewers: session.totalPeakViewers || 0,
        viewsByPlatform: viewsByPlatform || {},
      },
    });
  });

  // GET /live-sessions/templates - Get available templates (convenience endpoint)
  fastify.get('/templates', async (request, reply) => {
    const templates = await fastify.db
      .select({
        id: sessionTemplates.id,
        name: sessionTemplates.name,
        description: sessionTemplates.description,
        platforms: sessionTemplates.platforms,
        isDefault: sessionTemplates.isDefault,
      })
      .from(sessionTemplates)
      .where(eq(sessionTemplates.creatorId, request.creator.id))
      .orderBy(desc(sessionTemplates.isDefault), desc(sessionTemplates.createdAt));

    return reply.send({ templates });
  });
}
