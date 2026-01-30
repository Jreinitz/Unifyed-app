import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, sum, desc, sql, gte } from 'drizzle-orm';
import { AnalyticsService } from '../services/analytics.service.js';
import { authPlugin } from '../plugins/auth.js';
import { liveSessions, orders, checkoutSessions, attributionContexts, streams } from '@unifyed/db/schema';

// Validation schemas
const periodSchema = z.object({
  period: z.enum(['day', 'week', 'month', '7d', '30d', '90d']).optional().default('7d'),
});

const topItemsSchema = z.object({
  period: z.enum(['day', 'week', 'month', '7d', '30d', '90d']).optional().default('7d'),
  limit: z.coerce.number().min(1).max(50).optional().default(5),
});

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Initialize analytics service
  const analyticsService = new AnalyticsService(fastify.db);

  // All routes require authentication
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /analytics/summary
   * Get key metrics summary (revenue, orders, AOV, conversion rate)
   */
  fastify.get('/summary', async (request, reply) => {
    const { period } = periodSchema.parse(request.query);
    const summary = await analyticsService.getSummary(request.creator.id, period);
    return reply.send(summary);
  });

  /**
   * GET /analytics/revenue/by-platform
   * Get revenue breakdown by platform (TikTok, YouTube, Twitch, etc.)
   */
  fastify.get('/revenue/by-platform', async (request, reply) => {
    const { period } = periodSchema.parse(request.query);
    const data = await analyticsService.getRevenueByPlatform(request.creator.id, period);
    return reply.send({ platforms: data });
  });

  /**
   * GET /analytics/revenue/by-surface
   * Get revenue breakdown by surface type (live, replay, link_in_bio, etc.)
   */
  fastify.get('/revenue/by-surface', async (request, reply) => {
    const { period } = periodSchema.parse(request.query);
    const data = await analyticsService.getRevenueBySurface(request.creator.id, period);
    return reply.send({ surfaces: data });
  });

  /**
   * GET /analytics/revenue/time-series
   * Get daily revenue data for charts
   */
  fastify.get('/revenue/time-series', async (request, reply) => {
    const { period } = periodSchema.parse(request.query);
    const data = await analyticsService.getRevenueTimeSeries(request.creator.id, period);
    return reply.send({ data });
  });

  /**
   * GET /analytics/top-offers
   * Get best performing offers
   */
  fastify.get('/top-offers', async (request, reply) => {
    const { period, limit } = topItemsSchema.parse(request.query);
    const offers = await analyticsService.getTopOffers(request.creator.id, period, limit);
    return reply.send({ offers });
  });

  /**
   * GET /analytics/top-streams
   * Get best performing streams/live sessions
   */
  fastify.get('/top-streams', async (request, reply) => {
    const { period, limit } = topItemsSchema.parse(request.query);
    const streams = await analyticsService.getTopStreams(request.creator.id, period, limit);
    return reply.send({ streams });
  });

  /**
   * GET /analytics/recent-orders
   * Get recent orders with attribution
   */
  fastify.get('/recent-orders', async (request, reply) => {
    const { limit } = z.object({
      limit: z.coerce.number().min(1).max(50).optional().default(10),
    }).parse(request.query);
    
    const orders = await analyticsService.getRecentOrders(request.creator.id, limit);
    return reply.send({ orders });
  });

  /**
   * GET /analytics/dashboard
   * Get all dashboard data in one call (for initial load)
   */
  fastify.get('/dashboard', async (request, reply) => {
    const { period } = periodSchema.parse(request.query);

    const [
      summary,
      revenueByPlatform,
      revenueBySurface,
      revenueTimeSeries,
      topOffers,
      topStreams,
      recentOrders,
    ] = await Promise.all([
      analyticsService.getSummary(request.creator.id, period),
      analyticsService.getRevenueByPlatform(request.creator.id, period),
      analyticsService.getRevenueBySurface(request.creator.id, period),
      analyticsService.getRevenueTimeSeries(request.creator.id, period),
      analyticsService.getTopOffers(request.creator.id, period, 5),
      analyticsService.getTopStreams(request.creator.id, period, 5),
      analyticsService.getRecentOrders(request.creator.id, 10),
    ]);

    return reply.send({
      period,
      summary,
      revenueByPlatform,
      revenueBySurface,
      revenueTimeSeries,
      topOffers,
      topStreams,
      recentOrders,
    });
  });

  // Session analytics schemas
  const sessionsQuerySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(50).default(20),
    status: z.enum(['preparing', 'live', 'ending', 'ended']).optional(),
  });

  const sessionIdParamsSchema = z.object({
    id: z.string().uuid(),
  });

  /**
   * GET /analytics/sessions
   * Get sessions list with analytics metrics
   */
  fastify.get('/sessions', async (request, reply) => {
    const { page, limit, status } = sessionsQuerySchema.parse(request.query);
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [eq(liveSessions.creatorId, request.creator.id)];
    if (status) {
      conditions.push(eq(liveSessions.status, status));
    }

    // Get total count
    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(liveSessions)
      .where(and(...conditions));

    const total = Number(countResult?.count || 0);

    // Get sessions
    const sessionList = await fastify.db
      .select()
      .from(liveSessions)
      .where(and(...conditions))
      .orderBy(desc(liveSessions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get stats for each session
    const sessionsWithStats = await Promise.all(
      sessionList.map(async (session) => {
        // Get order stats
        const orderStats = await fastify.db
          .select({
            orderCount: count(orders.id),
            totalRevenue: sum(orders.totalAmount),
          })
          .from(orders)
          .innerJoin(attributionContexts, eq(orders.attributionContextId, attributionContexts.id))
          .where(eq(attributionContexts.liveSessionId, session.id));

        const orderCount = Number(orderStats[0]?.orderCount || 0);
        const totalRevenue = Number(orderStats[0]?.totalRevenue || 0);

        // Calculate duration
        let duration = 0;
        if (session.startedAt) {
          const endTime = session.endedAt ? new Date(session.endedAt) : new Date();
          duration = Math.floor((endTime.getTime() - new Date(session.startedAt).getTime()) / 1000);
        }

        return {
          id: session.id,
          title: session.title,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          duration,
          totalPeakViewers: session.totalPeakViewers,
          totalViews: session.totalViews,
          viewsByPlatform: session.viewsByPlatform as Record<string, number> | null,
          stats: {
            revenue: totalRevenue,
            orders: orderCount,
          },
          createdAt: session.createdAt,
        };
      })
    );

    return reply.send({
      sessions: sessionsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  /**
   * GET /analytics/sessions/:id
   * Get detailed analytics for a specific session
   */
  fastify.get('/sessions/:id', async (request, reply) => {
    const { id } = sessionIdParamsSchema.parse(request.params);

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
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Get streams for the session
    const sessionStreams = await fastify.db
      .select()
      .from(streams)
      .where(eq(streams.liveSessionId, id));

    // Get order stats
    const orderStats = await fastify.db
      .select({
        orderCount: count(orders.id),
        totalRevenue: sum(orders.totalAmount),
      })
      .from(orders)
      .innerJoin(attributionContexts, eq(orders.attributionContextId, attributionContexts.id))
      .where(eq(attributionContexts.liveSessionId, id));

    // Get checkout stats
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

    // Get orders list for this session
    const sessionOrders = await fastify.db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        status: orders.status,
        customerEmail: orders.customerEmail,
        createdAt: orders.createdAt,
        platform: attributionContexts.platform,
      })
      .from(orders)
      .innerJoin(attributionContexts, eq(orders.attributionContextId, attributionContexts.id))
      .where(eq(attributionContexts.liveSessionId, id))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    // Calculate duration
    let duration = 0;
    if (session.startedAt) {
      const endTime = session.endedAt ? new Date(session.endedAt) : new Date();
      duration = Math.floor((endTime.getTime() - new Date(session.startedAt).getTime()) / 1000);
    }

    // Revenue by platform for this session
    const revenueByPlatform = await fastify.db
      .select({
        platform: attributionContexts.platform,
        revenue: sum(orders.totalAmount),
        orderCount: count(orders.id),
      })
      .from(orders)
      .innerJoin(attributionContexts, eq(orders.attributionContextId, attributionContexts.id))
      .where(eq(attributionContexts.liveSessionId, id))
      .groupBy(attributionContexts.platform);

    return reply.send({
      session: {
        id: session.id,
        title: session.title,
        description: session.description,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        duration,
        totalPeakViewers: session.totalPeakViewers,
        totalViews: session.totalViews,
        viewsByPlatform: session.viewsByPlatform,
        metadata: session.metadata,
        createdAt: session.createdAt,
      },
      streams: sessionStreams.map(s => ({
        id: s.id,
        platform: s.platform,
        status: s.status,
        title: s.title,
        peakViewers: s.peakViewers,
        totalViews: s.totalViews,
        actualStartAt: s.actualStartAt,
        endedAt: s.endedAt,
      })),
      stats: {
        revenue: totalRevenue,
        orders: orderCount,
        checkouts: checkoutCount,
        conversionRate: Math.round(conversionRate * 10) / 10,
        averageOrderValue: orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0,
      },
      revenueByPlatform: revenueByPlatform.map(r => ({
        platform: r.platform,
        revenue: Number(r.revenue || 0),
        orders: Number(r.orderCount || 0),
      })),
      orders: sessionOrders.map(o => ({
        id: o.id,
        totalAmount: o.totalAmount,
        status: o.status,
        customerEmail: o.customerEmail,
        platform: o.platform,
        createdAt: o.createdAt,
      })),
    });
  });
}
