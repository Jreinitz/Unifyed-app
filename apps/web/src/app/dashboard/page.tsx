'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header, StatsCard, OnboardingWizard } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/client';

interface AnalyticsSummary {
  revenue: { total: number; change: number };
  orders: { total: number; change: number };
  views: { total: number; change: number };
  conversionRate: { total: number; change: number };
}

interface RecentOrder {
  id: string;
  total: number;
  customerName: string | null;
  platform: string | null;
  createdAt: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: '🎵',
  youtube: '▶️',
  twitch: '🎮',
  instagram: '📷',
  facebook: '📘',
  direct: '🔗',
};

export default function DashboardHome() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setLoading(false);
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      // Fetch analytics summary
      const [summaryRes, ordersRes] = await Promise.all([
        fetch(`${apiUrl}/analytics/summary?period=7d`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`${apiUrl}/analytics/recent-orders?limit=5`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setRecentOrders(ordersData.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value));
  };

  return (
    <>
      <Header 
        title="Dashboard" 
        subtitle="Welcome back! Here's what's happening with your store."
        actions={
          <a 
            href="/dashboard/streams"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Go Live
          </a>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        {/* Onboarding Wizard - shown for new creators */}
        <OnboardingWizard />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Revenue"
            value={summary ? formatCurrency(summary.revenue.total) : loading ? '...' : '$0'}
            change={summary ? { 
              value: Math.abs(summary.revenue.change), 
              type: summary.revenue.change >= 0 ? 'increase' : 'decrease' 
            } : undefined}
            icon={
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatsCard
            title="Orders"
            value={summary ? formatNumber(summary.orders.total) : loading ? '...' : '0'}
            change={summary ? { 
              value: Math.abs(summary.orders.change), 
              type: summary.orders.change >= 0 ? 'increase' : 'decrease' 
            } : undefined}
            icon={
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            }
          />
          <StatsCard
            title="Views"
            value={summary ? formatNumber(summary.views.total) : loading ? '...' : '0'}
            change={summary ? { 
              value: Math.abs(summary.views.change), 
              type: summary.views.change >= 0 ? 'increase' : 'decrease' 
            } : undefined}
            icon={
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
          />
          <StatsCard
            title="Conversion Rate"
            value={summary ? `${summary.conversionRate.total.toFixed(1)}%` : loading ? '...' : '0%'}
            change={summary ? { 
              value: Math.abs(summary.conversionRate.change), 
              type: summary.conversionRate.change >= 0 ? 'increase' : 'decrease' 
            } : undefined}
            icon={
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/dashboard/offers"
              className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
            >
              <div className="p-3 bg-indigo-100 rounded-lg mb-3">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-900">Create Offer</span>
            </a>
            <a
              href="/dashboard/streams"
              className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors"
            >
              <div className="p-3 bg-red-100 rounded-lg mb-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-900">Go Live</span>
            </a>
            <a
              href="/dashboard/replays"
              className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <div className="p-3 bg-blue-100 rounded-lg mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-900">View Replays</span>
            </a>
            <a
              href="/dashboard/analytics"
              className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
            >
              <div className="p-3 bg-green-100 rounded-lg mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-900">View Analytics</span>
            </a>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
            <a href="/dashboard/analytics" className="text-sm text-indigo-600 hover:text-indigo-700">
              View all →
            </a>
          </div>
          
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 animate-pulse">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📦</div>
              <p className="text-gray-500">No orders yet</p>
              <p className="text-sm text-gray-400 mt-1">Orders will appear here once you make sales</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="p-2 bg-green-100 rounded-lg">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {order.customerName || 'New Order'} • {formatCurrency(order.total)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {PLATFORM_ICONS[order.platform || 'direct'] || '🔗'} {order.platform || 'Direct'} • {' '}
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-green-600">
                    {formatCurrency(order.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
