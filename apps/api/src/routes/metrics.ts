import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MetricsService, type MetricEventType } from '../services/metrics.service.js';
import { authPlugin } from '../plugins/auth.js';

// Validation schemas
const trackEventSchema = z.object({
  type: z.string(),
  visitorId: z.string().optional(),
  sessionId: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

const getMetricsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).optional().default('week'),
});

export async function metricsRoutes(fastify: FastifyInstance) {
  // Initialize metrics service
  const metricsService = new MetricsService(fastify.db, fastify.redis);

  // POST /metrics/track - Track a public event (no auth required for client-side tracking)
  fastify.post('/track', async (request, reply) => {
    const body = trackEventSchema.parse(request.body);
    
    // Only allow specific event types from public endpoint
    const allowedPublicEvents: MetricEventType[] = [
      'offer.viewed',
      'offer.clicked',
      'replay.viewed',
      'replay.clicked',
      'link.clicked',
      'checkout.started',
    ];

    if (!allowedPublicEvents.includes(body.type as MetricEventType)) {
      return reply.status(400).send({ error: 'Invalid event type' });
    }

    await metricsService.track({
      type: body.type as MetricEventType,
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      properties: body.properties,
    });

    return reply.send({ success: true });
  });

  // Protected routes require authentication
  await fastify.register(async function protectedRoutes(fastify) {
    await fastify.register(authPlugin);

    // POST /metrics/events - Track authenticated events
    fastify.post('/events', {
      onRequest: [fastify.authenticate],
    }, async (request, reply) => {
      const body = trackEventSchema.parse(request.body);

      await metricsService.track({
        type: body.type as MetricEventType,
        creatorId: request.creator.id,
        properties: body.properties,
      });

      return reply.send({ success: true });
    });

    // GET /metrics/dashboard - Get dashboard metrics
    fastify.get('/dashboard', {
      onRequest: [fastify.authenticate],
    }, async (request, reply) => {
      const query = getMetricsQuerySchema.parse(request.query);

      const [
        creatorMetrics,
        retention,
        avgTimeToFirstOffer,
        platformAttribution,
      ] = await Promise.all([
        metricsService.getCreatorMetrics(request.creator.id, query.period),
        metricsService.getWeeklyRetention(),
        metricsService.getAverageTimeToFirstOffer(),
        metricsService.getPlatformAttribution(request.creator.id, query.period),
      ]);

      return reply.send({
        period: query.period,
        metrics: creatorMetrics,
        retention: {
          weekly: retention,
          target: 80, // 80% target from plan
        },
        timeToFirstOffer: {
          average: avgTimeToFirstOffer,
          target: 10, // 10 minutes target from plan
        },
        platformAttribution,
      });
    });

    // GET /metrics/conversion-funnel - Get conversion funnel
    fastify.get('/conversion-funnel', {
      onRequest: [fastify.authenticate],
    }, async (request, reply) => {
      const query = getMetricsQuerySchema.parse(request.query);
      const metrics = await metricsService.getCreatorMetrics(request.creator.id, query.period);

      const funnel = [
        { stage: 'Views', count: metrics['offer_viewed'] ?? 0 },
        { stage: 'Clicks', count: metrics['offer_clicked'] ?? 0 },
        { stage: 'Checkouts', count: metrics['checkout_started'] ?? 0 },
        { stage: 'Completed', count: metrics['checkout_completed'] ?? 0 },
        { stage: 'Orders', count: metrics['order_created'] ?? 0 },
      ];

      // Calculate conversion rates between stages
      const funnelWithRates = funnel.map((stage, index) => {
        if (index === 0) return { ...stage, rate: 100 };
        const prevStage = funnel[index - 1];
        const prevCount = prevStage?.count ?? 0;
        const rate = prevCount > 0 ? (stage.count / prevCount) * 100 : 0;
        return { ...stage, rate: Math.round(rate * 10) / 10 };
      });

      return reply.send({ funnel: funnelWithRates });
    });
  });
}
