import type { Database } from '@unifyed/db';
import { 
  orders, 
  checkoutSessions, 
  attributionContexts
} from '@unifyed/db/schema';
import { eq, and, gte, lte, sql, count, sum, desc, isNotNull } from 'drizzle-orm';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface AnalyticsSummary {
  revenue: {
    total: number;
    previousTotal: number;
    change: number;
  };
  orders: {
    total: number;
    previousTotal: number;
    change: number;
  };
  avgOrderValue: {
    total: number;
    previousTotal: number;
    change: number;
  };
  views: {
    total: number;
    previousTotal: number;
    change: number;
  };
  conversionRate: {
    total: number;
    previousTotal: number;
    change: number;
  };
}

export interface RevenueByPlatform {
  platform: string;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface RevenueBySurface {
  surface: string;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface TimeSeriesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopOffer {
  id: string;
  title: string;
  revenue: number;
  orders: number;
  conversionRate: number;
}

export interface TopStream {
  id: string;
  title: string | null;
  platform: string | null;
  revenue: number;
  orders: number;
  peakViewers: number | null;
  startedAt: Date | null;
}

export class AnalyticsService {
  constructor(private db: Database) {}

  /**
   * Get date range based on period
   */
  getDateRange(period: 'day' | 'week' | 'month' | '7d' | '30d' | '90d'): DateRange {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (period) {
      case 'day':
        // Today
        break;
      case 'week':
      case '7d':
        start.setDate(start.getDate() - 6);
        break;
      case 'month':
      case '30d':
        start.setDate(start.getDate() - 29);
        break;
      case '90d':
        start.setDate(start.getDate() - 89);
        break;
    }

    return { start, end };
  }

  /**
   * Get previous period for comparison
   */
  getPreviousDateRange(range: DateRange): DateRange {
    const duration = range.end.getTime() - range.start.getTime();
    return {
      start: new Date(range.start.getTime() - duration),
      end: new Date(range.end.getTime() - duration),
    };
  }

  /**
   * Get analytics summary for a creator
   */
  async getSummary(
    creatorId: string,
    period: 'day' | 'week' | 'month' | '7d' | '30d' | '90d' = '7d'
  ): Promise<AnalyticsSummary> {
    const range = this.getDateRange(period);
    const prevRange = this.getPreviousDateRange(range);

    // Current period
    const [currentOrders] = await this.db
      .select({
        count: count(),
        total: sum(orders.total),
      })
      .from(orders)
      .where(
        and(
          eq(orders.creatorId, creatorId),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end)
        )
      );

    // Previous period
    const [prevOrders] = await this.db
      .select({
        count: count(),
        total: sum(orders.total),
      })
      .from(orders)
      .where(
        and(
          eq(orders.creatorId, creatorId),
          gte(orders.createdAt, prevRange.start),
          lte(orders.createdAt, prevRange.end)
        )
      );

    // Checkout sessions (for conversion calculation)
    const [currentCheckouts] = await this.db
      .select({ count: count() })
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.creatorId, creatorId),
          gte(checkoutSessions.createdAt, range.start),
          lte(checkoutSessions.createdAt, range.end)
        )
      );

    const [prevCheckouts] = await this.db
      .select({ count: count() })
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.creatorId, creatorId),
          gte(checkoutSessions.createdAt, prevRange.start),
          lte(checkoutSessions.createdAt, prevRange.end)
        )
      );

    // Calculate metrics
    const currentRevenue = Number(currentOrders?.total ?? 0) / 100; // Convert cents to dollars
    const prevRevenue = Number(prevOrders?.total ?? 0) / 100;
    const currentOrderCount = Number(currentOrders?.count ?? 0);
    const prevOrderCount = Number(prevOrders?.count ?? 0);
    const currentCheckoutCount = Number(currentCheckouts?.count ?? 0);
    const prevCheckoutCount = Number(prevCheckouts?.count ?? 0);

    const currentAov = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;
    const prevAov = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;

    const currentConversion = currentCheckoutCount > 0 
      ? (currentOrderCount / currentCheckoutCount) * 100 
      : 0;
    const prevConversion = prevCheckoutCount > 0 
      ? (prevOrderCount / prevCheckoutCount) * 100 
      : 0;

    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      revenue: {
        total: currentRevenue,
        previousTotal: prevRevenue,
        change: calcChange(currentRevenue, prevRevenue),
      },
      orders: {
        total: currentOrderCount,
        previousTotal: prevOrderCount,
        change: calcChange(currentOrderCount, prevOrderCount),
      },
      avgOrderValue: {
        total: currentAov,
        previousTotal: prevAov,
        change: calcChange(currentAov, prevAov),
      },
      views: {
        // TODO: Implement actual view tracking
        total: currentCheckoutCount * 10, // Placeholder: assume 10 views per checkout
        previousTotal: prevCheckoutCount * 10,
        change: calcChange(currentCheckoutCount * 10, prevCheckoutCount * 10),
      },
      conversionRate: {
        total: currentConversion,
        previousTotal: prevConversion,
        change: calcChange(currentConversion, prevConversion),
      },
    };
  }

  /**
   * Get revenue breakdown by platform
   */
  async getRevenueByPlatform(
    creatorId: string,
    period: 'day' | 'week' | 'month' | '7d' | '30d' | '90d' = '7d'
  ): Promise<RevenueByPlatform[]> {
    const range = this.getDateRange(period);

    const results = await this.db
      .select({
        platform: attributionContexts.platform,
        revenue: sum(orders.total),
        orderCount: count(),
      })
      .from(orders)
      .leftJoin(
        attributionContexts,
        eq(orders.attributionContextId, attributionContexts.id)
      )
      .where(
        and(
          eq(orders.creatorId, creatorId),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end)
        )
      )
      .groupBy(attributionContexts.platform);

    const totalRevenue = results.reduce((acc, r) => acc + Number(r.revenue ?? 0), 0);

    return results.map((r) => ({
      platform: r.platform || 'direct',
      revenue: Number(r.revenue ?? 0) / 100,
      orders: Number(r.orderCount),
      percentage: totalRevenue > 0 ? (Number(r.revenue ?? 0) / totalRevenue) * 100 : 0,
    }));
  }

  /**
   * Get revenue breakdown by surface type
   */
  async getRevenueBySurface(
    creatorId: string,
    period: 'day' | 'week' | 'month' | '7d' | '30d' | '90d' = '7d'
  ): Promise<RevenueBySurface[]> {
    const range = this.getDateRange(period);

    const results = await this.db
      .select({
        surface: attributionContexts.surface,
        revenue: sum(orders.total),
        orderCount: count(),
      })
      .from(orders)
      .leftJoin(
        attributionContexts,
        eq(orders.attributionContextId, attributionContexts.id)
      )
      .where(
        and(
          eq(orders.creatorId, creatorId),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end)
        )
      )
      .groupBy(attributionContexts.surface);

    const totalRevenue = results.reduce((acc, r) => acc + Number(r.revenue ?? 0), 0);

    return results.map((r) => ({
      surface: r.surface || 'direct',
      revenue: Number(r.revenue ?? 0) / 100,
      orders: Number(r.orderCount),
      percentage: totalRevenue > 0 ? (Number(r.revenue ?? 0) / totalRevenue) * 100 : 0,
    }));
  }

  /**
   * Get time-series revenue data for charts
   */
  async getRevenueTimeSeries(
    creatorId: string,
    period: 'day' | 'week' | 'month' | '7d' | '30d' | '90d' = '7d'
  ): Promise<TimeSeriesPoint[]> {
    const range = this.getDateRange(period);

    // Generate all dates in range
    const dates: string[] = [];
    const current = new Date(range.start);
    while (current <= range.end) {
      dates.push(current.toISOString().split('T')[0]!);
      current.setDate(current.getDate() + 1);
    }

    // Query orders grouped by date
    const results = await this.db
      .select({
        date: sql<string>`DATE(${orders.createdAt})`,
        revenue: sum(orders.total),
        orderCount: count(),
      })
      .from(orders)
      .where(
        and(
          eq(orders.creatorId, creatorId),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end)
        )
      )
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);

    // Create lookup map
    const dataByDate = new Map<string, { revenue: number; orders: number }>();
    for (const r of results) {
      dataByDate.set(r.date, {
        revenue: Number(r.revenue ?? 0) / 100,
        orders: Number(r.orderCount),
      });
    }

    // Fill in all dates
    return dates.map((date) => ({
      date,
      revenue: dataByDate.get(date)?.revenue ?? 0,
      orders: dataByDate.get(date)?.orders ?? 0,
    }));
  }

  /**
   * Get top performing offers
   */
  async getTopOffers(
    creatorId: string,
    period: 'day' | 'week' | 'month' | '7d' | '30d' | '90d' = '7d',
    limit: number = 5
  ): Promise<TopOffer[]> {
    const range = this.getDateRange(period);

    // Get orders with offers
    const orderResults = await this.db
      .select({
        offerId: checkoutSessions.offerId,
        revenue: sum(orders.total),
        orderCount: count(),
      })
      .from(orders)
      .innerJoin(
        checkoutSessions,
        eq(orders.checkoutSessionId, checkoutSessions.id)
      )
      .where(
        and(
          eq(orders.creatorId, creatorId),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end),
          isNotNull(checkoutSessions.offerId)
        )
      )
      .groupBy(checkoutSessions.offerId)
      .orderBy(desc(sum(orders.total)))
      .limit(limit);

    // Get checkout counts for conversion rate
    const checkoutResults = await this.db
      .select({
        offerId: checkoutSessions.offerId,
        checkoutCount: count(),
      })
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.creatorId, creatorId),
          gte(checkoutSessions.createdAt, range.start),
          lte(checkoutSessions.createdAt, range.end),
          isNotNull(checkoutSessions.offerId)
        )
      )
      .groupBy(checkoutSessions.offerId);

    const checkoutsByOffer = new Map<string, number>();
    for (const c of checkoutResults) {
      if (c.offerId) {
        checkoutsByOffer.set(c.offerId, Number(c.checkoutCount));
      }
    }

    // Get offer details
    const offerIds = orderResults
      .map((r) => r.offerId)
      .filter((id): id is string => id !== null);
    
    const offerDetails = offerIds.length > 0
      ? await this.db.query.offers.findMany({
          where: (o, { inArray }) => inArray(o.id, offerIds),
        })
      : [];

    const offerMap = new Map(offerDetails.map((o) => [o.id, o]));

    return orderResults
      .filter((r) => r.offerId)
      .map((r) => {
        const offer = offerMap.get(r.offerId!);
        const orderCount = Number(r.orderCount);
        const checkoutCount = checkoutsByOffer.get(r.offerId!) || orderCount;
        return {
          id: r.offerId!,
          title: offer?.name || 'Unknown Offer',
          revenue: Number(r.revenue ?? 0) / 100,
          orders: orderCount,
          conversionRate: checkoutCount > 0 ? (orderCount / checkoutCount) * 100 : 0,
        };
      });
  }

  /**
   * Get top performing streams/live sessions
   */
  async getTopStreams(
    creatorId: string,
    period: 'day' | 'week' | 'month' | '7d' | '30d' | '90d' = '7d',
    limit: number = 5
  ): Promise<TopStream[]> {
    const range = this.getDateRange(period);

    // Get orders attributed to live sessions
    const results = await this.db
      .select({
        liveSessionId: attributionContexts.liveSessionId,
        revenue: sum(orders.total),
        orderCount: count(),
      })
      .from(orders)
      .innerJoin(
        attributionContexts,
        eq(orders.attributionContextId, attributionContexts.id)
      )
      .where(
        and(
          eq(orders.creatorId, creatorId),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end),
          isNotNull(attributionContexts.liveSessionId)
        )
      )
      .groupBy(attributionContexts.liveSessionId)
      .orderBy(desc(sum(orders.total)))
      .limit(limit);

    // Get session details
    const sessionIds = results
      .map((r) => r.liveSessionId)
      .filter((id): id is string => id !== null);
    
    const sessionDetails = sessionIds.length > 0
      ? await this.db.query.liveSessions.findMany({
          where: (s, { inArray }) => inArray(s.id, sessionIds),
        })
      : [];

    const sessionMap = new Map(sessionDetails.map((s) => [s.id, s]));

    return results
      .filter((r) => r.liveSessionId)
      .map((r) => {
        const session = sessionMap.get(r.liveSessionId!);
        return {
          id: r.liveSessionId!,
          title: session?.title || 'Live Stream',
          platform: null, // Live session spans multiple platforms
          revenue: Number(r.revenue ?? 0) / 100,
          orders: Number(r.orderCount),
          peakViewers: session?.totalPeakViewers || null,
          startedAt: session?.startedAt || null,
        };
      });
  }

  /**
   * Get recent orders
   */
  async getRecentOrders(
    creatorId: string,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    total: number;
    customerName: string | null;
    platform: string | null;
    surface: string | null;
    createdAt: Date;
  }>> {
    const results = await this.db
      .select({
        id: orders.id,
        total: orders.total,
        customerName: orders.customerName,
        platform: attributionContexts.platform,
        surface: attributionContexts.surface,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(
        attributionContexts,
        eq(orders.attributionContextId, attributionContexts.id)
      )
      .where(eq(orders.creatorId, creatorId))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    return results.map((r) => ({
      id: r.id,
      total: Number(r.total) / 100,
      customerName: r.customerName,
      platform: r.platform,
      surface: r.surface,
      createdAt: r.createdAt,
    }));
  }
}
