'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Header, StatsCard } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/client';

interface Stream {
  id: string;
  platform: string | null;
  status: string;
  title: string | null;
  peakViewers: number | null;
  totalViews: number | null;
  actualStartAt: string | null;
  endedAt: string | null;
}

interface Order {
  id: string;
  totalAmount: number;
  status: string;
  customerEmail: string | null;
  platform: string | null;
  createdAt: string;
}

interface PlatformRevenue {
  platform: string | null;
  revenue: number;
  orders: number;
}

interface SessionDetail {
  session: {
    id: string;
    title: string | null;
    description: string | null;
    status: 'preparing' | 'live' | 'ending' | 'ended';
    startedAt: string | null;
    endedAt: string | null;
    duration: number;
    totalPeakViewers: number | null;
    totalViews: number | null;
    viewsByPlatform: Record<string, number> | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  };
  streams: Stream[];
  stats: {
    revenue: number;
    orders: number;
    checkouts: number;
    conversionRate: number;
    averageOrderValue: number;
  };
  revenueByPlatform: PlatformRevenue[];
  orders: Order[];
}

const STATUS_COLORS = {
  preparing: 'bg-yellow-100 text-yellow-700',
  live: 'bg-red-100 text-red-700',
  ending: 'bg-orange-100 text-orange-700',
  ended: 'bg-gray-100 text-gray-700',
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-pink-500',
  youtube: 'bg-red-500',
  twitch: 'bg-purple-500',
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/analytics/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError('Session not found');
        } else {
          throw new Error('Failed to fetch session');
        }
        return;
      }

      const responseData = await res.json();
      setData(responseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="text-center py-12">
            <div className="text-4xl mb-4">😕</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">{error || 'Session not found'}</h3>
            <Link
              href="/dashboard/sessions"
              className="inline-flex px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
            >
              Back to Sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { session, streams, stats, revenueByPlatform, orders } = data;

  // Calculate total viewers from platform breakdown
  const totalViewersByPlatform = session.viewsByPlatform
    ? Object.values(session.viewsByPlatform).reduce((sum, v) => sum + v, 0)
    : 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/sessions"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Sessions
          </Link>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {session.title || 'Untitled Session'}
              </h1>
              <p className="text-gray-500 mt-1">
                {session.startedAt ? formatDate(session.startedAt) : formatDate(session.createdAt)}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[session.status]}`}>
              {session.status}
            </span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatsCard
            title="Revenue"
            value={formatCurrency(stats.revenue)}
            subtitle={stats.orders > 0 ? `${stats.orders} order${stats.orders !== 1 ? 's' : ''}` : undefined}
          />
          <StatsCard
            title="Peak Viewers"
            value={session.totalPeakViewers?.toLocaleString() || '0'}
            subtitle={totalViewersByPlatform > 0 ? `${totalViewersByPlatform.toLocaleString()} total` : undefined}
          />
          <StatsCard
            title="Duration"
            value={session.duration > 0 ? formatDuration(session.duration) : '-'}
          />
          <StatsCard
            title="Conversion Rate"
            value={`${stats.conversionRate}%`}
            subtitle={`${stats.checkouts} checkout${stats.checkouts !== 1 ? 's' : ''}`}
          />
          <StatsCard
            title="Avg Order Value"
            value={stats.averageOrderValue > 0 ? formatCurrency(stats.averageOrderValue) : '-'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Platform Performance */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Performance</h3>
            
            {/* Viewer breakdown bar */}
            {session.viewsByPlatform && Object.keys(session.viewsByPlatform).length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Viewer Distribution</p>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                  {Object.entries(session.viewsByPlatform).map(([platform, viewers]) => {
                    const percentage = totalViewersByPlatform > 0 ? (viewers / totalViewersByPlatform) * 100 : 0;
                    return (
                      <div
                        key={platform}
                        className={`h-full ${PLATFORM_COLORS[platform] || 'bg-gray-500'}`}
                        style={{ width: `${percentage}%` }}
                        title={`${platform}: ${viewers.toLocaleString()} viewers`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-4 mt-2">
                  {Object.entries(session.viewsByPlatform).map(([platform, viewers]) => (
                    <div key={platform} className="flex items-center gap-2 text-sm">
                      <span className={`w-3 h-3 rounded-full ${PLATFORM_COLORS[platform] || 'bg-gray-500'}`}></span>
                      <span className="text-gray-600 capitalize">{platform}</span>
                      <span className="font-medium">{viewers.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revenue by platform */}
            {revenueByPlatform.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-2">Revenue by Platform</p>
                <div className="space-y-3">
                  {revenueByPlatform.map((item) => (
                    <div key={item.platform || 'unknown'} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${PLATFORM_COLORS[item.platform || ''] || 'bg-gray-500'}`}></span>
                        <span className="text-gray-700 capitalize">{item.platform || 'Unknown'}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-gray-900">{formatCurrency(item.revenue)}</span>
                        <span className="text-gray-500 text-sm ml-2">({item.orders} orders)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streams */}
            {streams.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500 mb-3">Individual Streams</p>
                <div className="space-y-2">
                  {streams.map((stream) => (
                    <div key={stream.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${PLATFORM_COLORS[stream.platform || ''] || 'bg-gray-500'}`}></span>
                        <span className="font-medium text-gray-900 capitalize">{stream.platform}</span>
                        {stream.title && <span className="text-gray-500 text-sm">- {stream.title}</span>}
                      </div>
                      <div className="text-sm text-gray-600">
                        {stream.peakViewers?.toLocaleString() || 0} peak
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Orders</h3>
            
            {orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-3xl mb-2">📦</div>
                No orders during this session
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {orders.map((order) => (
                  <div key={order.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-green-600">
                        {formatCurrency(order.totalAmount)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTime(order.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {order.platform && (
                        <span className="capitalize">{order.platform}</span>
                      )}
                      {order.customerEmail && (
                        <span className="truncate">{order.customerEmail}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Session Metadata */}
        {session.metadata && Object.keys(session.metadata).length > 0 && (
          <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {typeof session.metadata.templateName === 'string' && (
                <div>
                  <span className="text-gray-500">Template</span>
                  <p className="font-medium text-gray-900">{session.metadata.templateName}</p>
                </div>
              )}
              {session.startedAt && (
                <div>
                  <span className="text-gray-500">Started</span>
                  <p className="font-medium text-gray-900">{formatTime(session.startedAt)}</p>
                </div>
              )}
              {session.endedAt && (
                <div>
                  <span className="text-gray-500">Ended</span>
                  <p className="font-medium text-gray-900">{formatTime(session.endedAt)}</p>
                </div>
              )}
              {session.description && (
                <div className="col-span-2">
                  <span className="text-gray-500">Description</span>
                  <p className="font-medium text-gray-900">{session.description}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
