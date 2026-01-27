import type { Database } from '@unifyed/db';
import type { Redis } from 'ioredis';

// Metric event types
export type MetricEventType =
  // User lifecycle
  | 'user.signup'
  | 'user.login'
  | 'user.session.start'
  | 'user.session.end'
  // Onboarding funnel
  | 'onboarding.started'
  | 'onboarding.platform.connected'
  | 'onboarding.first.product'
  | 'onboarding.first.offer'
  | 'onboarding.completed'
  // Conversion funnel
  | 'offer.viewed'
  | 'offer.clicked'
  | 'checkout.started'
  | 'checkout.completed'
  | 'order.created'
  // Stream/Replay events
  | 'stream.started'
  | 'stream.ended'
  | 'replay.viewed'
  | 'replay.clicked'
  // Attribution
  | 'link.clicked'
  | 'link.checkout';

export interface MetricEvent {
  type: MetricEventType;
  creatorId?: string | undefined;
  visitorId?: string | undefined;
  sessionId?: string | undefined;
  properties?: Record<string, unknown> | undefined;
  timestamp?: Date | undefined;
}

export interface MetricsSummary {
  period: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  metrics: {
    // User metrics
    newSignups: number;
    activeUsers: number;
    retentionRate: number;
    // Onboarding metrics
    avgTimeToFirstOffer: number; // minutes
    onboardingCompletionRate: number;
    // Conversion metrics
    totalViews: number;
    totalClicks: number;
    totalCheckouts: number;
    totalOrders: number;
    conversionRate: number; // clicks to orders
    // Revenue metrics
    totalRevenue: number;
    avgOrderValue: number;
  };
}

export class MetricsService {
  // Note: db parameter reserved for future use when we persist metrics to the database
  constructor(
    _db: Database,
    private redis: Redis
  ) {}

  /**
   * Track a metric event
   */
  async track(event: MetricEvent): Promise<void> {
    const timestamp = event.timestamp ?? new Date();
    const key = this.getRedisKey(event.type, timestamp);
    
    // Increment counter in Redis
    await this.redis.hincrby(key, 'count', 1);
    
    // Set expiry for 90 days
    await this.redis.expire(key, 90 * 24 * 60 * 60);

    // Track creator-specific metrics
    if (event.creatorId) {
      const creatorKey = `metrics:creator:${event.creatorId}:${event.type}:${this.getDateKey(timestamp)}`;
      await this.redis.hincrby(creatorKey, 'count', 1);
      await this.redis.expire(creatorKey, 90 * 24 * 60 * 60);
    }

    // Track session for retention
    if (event.type === 'user.session.start' && event.creatorId) {
      const sessionKey = `metrics:sessions:${this.getWeekKey(timestamp)}`;
      await this.redis.sadd(sessionKey, event.creatorId);
      await this.redis.expire(sessionKey, 90 * 24 * 60 * 60);
    }

    // Track time-to-first-offer
    if (event.type === 'user.signup' && event.creatorId) {
      const signupKey = `metrics:signup:${event.creatorId}`;
      await this.redis.set(signupKey, timestamp.toISOString(), 'EX', 30 * 24 * 60 * 60);
    }

    if (event.type === 'onboarding.first.offer' && event.creatorId) {
      const signupKey = `metrics:signup:${event.creatorId}`;
      const signupTime = await this.redis.get(signupKey);
      if (signupTime) {
        const signupDate = new Date(signupTime);
        const timeToFirstOffer = (timestamp.getTime() - signupDate.getTime()) / 1000 / 60; // minutes
        
        // Store in a sorted set for percentile calculations
        const ttfoKey = `metrics:ttfo:${this.getMonthKey(timestamp)}`;
        await this.redis.zadd(ttfoKey, timeToFirstOffer, event.creatorId);
        await this.redis.expire(ttfoKey, 90 * 24 * 60 * 60);
      }
    }

    // Log for debugging (will be replaced with proper logging in production)
    console.log(`[METRIC] ${event.type}`, {
      creatorId: event.creatorId,
      visitorId: event.visitorId,
      properties: event.properties,
    });
  }

  /**
   * Get metrics summary for a creator
   */
  async getCreatorMetrics(
    creatorId: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<Record<string, number>> {
    const now = new Date();
    const metrics: Record<string, number> = {};

    // Get date range based on period
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = this.getDateKey(date);

      // Aggregate metrics for each event type
      const eventTypes: MetricEventType[] = [
        'offer.viewed',
        'offer.clicked',
        'checkout.started',
        'checkout.completed',
        'order.created',
        'replay.viewed',
        'replay.clicked',
      ];

      for (const eventType of eventTypes) {
        const key = `metrics:creator:${creatorId}:${eventType}:${dateKey}`;
        const count = await this.redis.hget(key, 'count');
        const metricName = eventType.replace('.', '_');
        metrics[metricName] = (metrics[metricName] ?? 0) + (parseInt(count ?? '0', 10));
      }
    }

    // Calculate conversion rate
    if (metrics['offer_clicked'] && metrics['order_created']) {
      metrics['conversion_rate'] = (metrics['order_created'] / metrics['offer_clicked']) * 100;
    }

    return metrics;
  }

  /**
   * Get weekly retention rate
   */
  async getWeeklyRetention(): Promise<number> {
    const now = new Date();
    const thisWeekKey = `metrics:sessions:${this.getWeekKey(now)}`;
    const lastWeekDate = new Date(now);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeekKey = `metrics:sessions:${this.getWeekKey(lastWeekDate)}`;

    // Get user count for last week (thisWeekKey used for intersection below)
    const lastWeekUsers = await this.redis.scard(lastWeekKey);

    if (lastWeekUsers === 0) return 0;

    // Get intersection of users
    const retainedUsers = await this.redis.sinter(thisWeekKey, lastWeekKey);
    
    return (retainedUsers.length / lastWeekUsers) * 100;
  }

  /**
   * Get average time to first offer (in minutes)
   */
  async getAverageTimeToFirstOffer(): Promise<number> {
    const now = new Date();
    const key = `metrics:ttfo:${this.getMonthKey(now)}`;
    
    // Get all times
    const times = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
    
    if (times.length === 0) return 0;

    // Calculate average
    let total = 0;
    let count = 0;
    for (let i = 1; i < times.length; i += 2) {
      const timeValue = times[i];
      if (timeValue !== undefined) {
        total += parseFloat(timeValue);
        count++;
      }
    }

    return count > 0 ? total / count : 0;
  }

  /**
   * Get platform attribution breakdown
   */
  async getPlatformAttribution(
    _creatorId: string,
    _period: 'day' | 'week' | 'month' = 'week'
  ): Promise<Record<string, { views: number; clicks: number; orders: number; revenue: number }>> {
    // TODO: This would query the orders and attribution_contexts tables
    // For now, return a placeholder
    return {
      tiktok: { views: 0, clicks: 0, orders: 0, revenue: 0 },
      youtube: { views: 0, clicks: 0, orders: 0, revenue: 0 },
      twitch: { views: 0, clicks: 0, orders: 0, revenue: 0 },
    };
  }

  // Helper methods
  private getRedisKey(eventType: string, date: Date): string {
    return `metrics:global:${eventType}:${this.getDateKey(date)}`;
  }

  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0] ?? ''; // YYYY-MM-DD
  }

  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const week = Math.ceil((((date.getTime() - oneJan.getTime()) / 86400000) + oneJan.getDay() + 1) / 7);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getMonthKey(date: Date): string {
    return date.toISOString().slice(0, 7); // YYYY-MM
  }
}
