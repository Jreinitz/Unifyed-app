import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AnalyticsService } from '../services/analytics.service.js';
import { authPlugin } from '../plugins/auth.js';

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
}
