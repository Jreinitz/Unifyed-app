'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/client';

// Types
interface AnalyticsSummary {
  revenue: { total: number; previousTotal: number; change: number };
  orders: { total: number; previousTotal: number; change: number };
  avgOrderValue: { total: number; previousTotal: number; change: number };
  views: { total: number; previousTotal: number; change: number };
  conversionRate: { total: number; previousTotal: number; change: number };
}

interface PlatformData {
  platform: string;
  revenue: number;
  orders: number;
  percentage: number;
}

interface SurfaceData {
  surface: string;
  revenue: number;
  orders: number;
  percentage: number;
}

interface TimeSeriesPoint {
  date: string;
  revenue: number;
  orders: number;
}

interface TopOffer {
  id: string;
  title: string;
  revenue: number;
  orders: number;
  conversionRate: number;
}

interface TopStream {
  id: string;
  title: string | null;
  platform: string | null;
  revenue: number;
  orders: number;
  peakViewers: number | null;
}

interface RecentOrder {
  id: string;
  total: number;
  customerName: string | null;
  platform: string | null;
  surface: string | null;
  createdAt: string;
}

interface DashboardData {
  summary: AnalyticsSummary;
  revenueByPlatform: PlatformData[];
  revenueBySurface: SurfaceData[];
  revenueTimeSeries: TimeSeriesPoint[];
  topOffers: TopOffer[];
  topStreams: TopStream[];
  recentOrders: RecentOrder[];
}

const PERIODS = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#000000',
  youtube: '#FF0000',
  twitch: '#9146FF',
  instagram: '#E1306C',
  facebook: '#1877F2',
  direct: '#6B7280',
};

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: '🎵',
  youtube: '▶️',
  twitch: '🎮',
  instagram: '📷',
  facebook: '📘',
  direct: '🔗',
};

const SURFACE_LABELS: Record<string, string> = {
  live: 'Live Streams',
  replay: 'Replays',
  link_in_bio: 'Link in Bio',
  dm: 'Direct Messages',
  agent: 'AI Agent',
  direct: 'Direct',
};

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/analytics/dashboard?period=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value));
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <Header title="Analytics" subtitle="Track your performance across all platforms" />
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        <Header 
          title="Analytics" 
          subtitle="Track your performance across all platforms"
          actions={
            <div className="flex gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value as '7d' | '30d' | '90d')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    period === p.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          }
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700">
              Dismiss
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <StatCard
                title="Revenue"
                value={formatCurrency(data.summary.revenue.total)}
                change={data.summary.revenue.change}
                icon="💰"
              />
              <StatCard
                title="Orders"
                value={formatNumber(data.summary.orders.total)}
                change={data.summary.orders.change}
                icon="📦"
              />
              <StatCard
                title="Avg Order Value"
                value={formatCurrency(data.summary.avgOrderValue.total)}
                change={data.summary.avgOrderValue.change}
                icon="🏷️"
              />
              <StatCard
                title="Views"
                value={formatNumber(data.summary.views.total)}
                change={data.summary.views.change}
                icon="👁️"
              />
              <StatCard
                title="Conversion Rate"
                value={`${data.summary.conversionRate.total.toFixed(1)}%`}
                change={data.summary.conversionRate.change}
                icon="📈"
              />
            </div>

            {/* Revenue Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Over Time</h2>
              <div className="h-64">
                <RevenueChart data={data.revenueTimeSeries} />
              </div>
            </div>

            {/* Platform & Surface Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* By Platform */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Platform</h2>
                {data.revenueByPlatform.length === 0 ? (
                  <EmptyState message="No platform data yet" />
                ) : (
                  <div className="space-y-4">
                    {data.revenueByPlatform.map((item) => (
                      <div key={item.platform} className="flex items-center gap-4">
                        <span className="text-xl">{PLATFORM_ICONS[item.platform] || '🔗'}</span>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700 capitalize">
                              {item.platform}
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {formatCurrency(item.revenue)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${item.percentage}%`,
                                backgroundColor: PLATFORM_COLORS[item.platform] || '#6B7280',
                              }}
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {item.orders} orders • {item.percentage.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* By Surface */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Source</h2>
                {data.revenueBySurface.length === 0 ? (
                  <EmptyState message="No source data yet" />
                ) : (
                  <div className="space-y-4">
                    {data.revenueBySurface.map((item) => (
                      <div key={item.surface} className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">
                              {SURFACE_LABELS[item.surface] || item.surface}
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {formatCurrency(item.revenue)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-indigo-500"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {item.orders} orders • {item.percentage.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top Performers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Top Offers */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Offers</h2>
                {data.topOffers.length === 0 ? (
                  <EmptyState message="No offer data yet" />
                ) : (
                  <div className="space-y-3">
                    {data.topOffers.map((offer, index) => (
                      <div
                        key={offer.id}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50"
                      >
                        <span className="text-lg font-bold text-gray-300">#{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{offer.title}</p>
                          <p className="text-sm text-gray-500">
                            {offer.orders} orders • {offer.conversionRate.toFixed(1)}% conversion
                          </p>
                        </div>
                        <span className="text-lg font-semibold text-green-600">
                          {formatCurrency(offer.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Streams */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Streams</h2>
                {data.topStreams.length === 0 ? (
                  <EmptyState message="No stream data yet" />
                ) : (
                  <div className="space-y-3">
                    {data.topStreams.map((stream, index) => (
                      <div
                        key={stream.id}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50"
                      >
                        <span className="text-lg font-bold text-gray-300">#{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {stream.title || 'Live Stream'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {stream.orders} orders
                            {stream.peakViewers && ` • ${formatNumber(stream.peakViewers)} peak viewers`}
                          </p>
                        </div>
                        <span className="text-lg font-semibold text-green-600">
                          {formatCurrency(stream.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h2>
              {data.recentOrders.length === 0 ? (
                <EmptyState message="No orders yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                        <th className="pb-3 font-medium">Customer</th>
                        <th className="pb-3 font-medium">Platform</th>
                        <th className="pb-3 font-medium">Source</th>
                        <th className="pb-3 font-medium text-right">Amount</th>
                        <th className="pb-3 font-medium text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.recentOrders.map((order) => (
                        <tr key={order.id} className="text-sm">
                          <td className="py-3 text-gray-900">
                            {order.customerName || 'Unknown'}
                          </td>
                          <td className="py-3">
                            <span className="inline-flex items-center gap-1">
                              {PLATFORM_ICONS[order.platform || 'direct'] || '🔗'}
                              <span className="capitalize">{order.platform || 'direct'}</span>
                            </span>
                          </td>
                          <td className="py-3 text-gray-500">
                            {SURFACE_LABELS[order.surface || 'direct'] || order.surface || 'direct'}
                          </td>
                          <td className="py-3 text-right font-medium text-gray-900">
                            {formatCurrency(order.total)}
                          </td>
                          <td className="py-3 text-right text-gray-500">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  change,
  icon,
}: {
  title: string;
  value: string;
  change: number;
  icon: string;
}) {
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className={`text-sm mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs previous period
      </div>
    </div>
  );
}

// Simple Revenue Chart Component (CSS-based)
function RevenueChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No revenue data for this period
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="flex items-end justify-between h-full gap-1">
      {data.map((point, index) => {
        const height = (point.revenue / maxRevenue) * 100;
        return (
          <div
            key={index}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${point.date}: $${point.revenue.toFixed(2)} (${point.orders} orders)`}
          >
            <div className="w-full flex-1 flex items-end">
              <div
                className="w-full bg-indigo-500 rounded-t transition-all hover:bg-indigo-600"
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            </div>
            {data.length <= 14 && (
              <span className="text-xs text-gray-400 truncate w-full text-center">
                {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Empty State Component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-4xl mb-2">📊</div>
      <p className="text-gray-500">{message}</p>
      <p className="text-sm text-gray-400 mt-1">Data will appear here once you have orders</p>
    </div>
  );
}
