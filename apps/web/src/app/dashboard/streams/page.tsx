'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard';
import { GoLive } from '@/components/dashboard/GoLive';
import { createClient } from '@/lib/supabase/client';

interface Stream {
  id: string;
  title: string;
  description: string | null;
  platform: string;
  platformStreamId: string;
  status: string;
  thumbnailUrl: string | null;
  viewerCount: number | null;
  peakViewerCount: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: '🎵',
  youtube: '▶️',
  twitch: '🎮',
  instagram: '📷',
};

const STATUS_COLORS: Record<string, string> = {
  live: 'bg-red-100 text-red-700',
  scheduled: 'bg-blue-100 text-blue-700',
  ended: 'bg-gray-100 text-gray-600',
  offline: 'bg-gray-100 text-gray-600',
};

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'live' | 'ended'>('all');

  const fetchStreams = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/streams?limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch streams');
      }

      const data = await res.json();
      setStreams(data.streams || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load streams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStreams();
    // Poll for live stream updates
    const interval = setInterval(fetchStreams, 30000);
    return () => clearInterval(interval);
  }, [fetchStreams]);

  const filteredStreams = streams.filter(stream => {
    if (filter === 'live') return stream.status === 'live';
    if (filter === 'ended') return stream.status === 'ended';
    return true;
  });

  const liveStreams = streams.filter(s => s.status === 'live');

  const formatDuration = (startedAt: string | null, endedAt: string | null) => {
    if (!startedAt) return '-';
    const start = new Date(startedAt);
    const end = endedAt ? new Date(endedAt) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        <Header 
          title="Streams" 
          subtitle="Monitor your live streams across all platforms"
        />

        {/* Go Live Section */}
        <div className="mb-8">
          <GoLive />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700">
              Dismiss
            </button>
          </div>
        )}

        {/* Live Now Banner */}
        {liveStreams.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="font-medium text-red-700">
                {liveStreams.length} stream{liveStreams.length !== 1 ? 's' : ''} live now
              </span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {(['all', 'live', 'ended'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === f
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'All Streams' : f === 'live' ? 'Live' : 'Past Streams'}
            </button>
          ))}
        </div>

        {/* Streams Grid */}
        {filteredStreams.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="text-4xl mb-4">📺</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {filter === 'live' ? 'No live streams' : 'No streams yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {filter === 'live' 
                ? 'Start streaming on a connected platform to see it here.'
                : 'Connect your streaming platforms and go live to track your streams.'}
            </p>
            <a
              href="/dashboard/connections"
              className="inline-flex px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Connect Platforms
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStreams.map((stream) => (
              <StreamCard 
                key={stream.id} 
                stream={stream} 
                formatDuration={formatDuration}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StreamCardProps {
  stream: Stream;
  formatDuration: (startedAt: string | null, endedAt: string | null) => string;
}

function StreamCard({ stream, formatDuration }: StreamCardProps) {
  const isLive = stream.status === 'live';

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-900 relative">
        {stream.thumbnailUrl ? (
          <img 
            src={stream.thumbnailUrl} 
            alt={stream.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {PLATFORM_ICONS[stream.platform] || '📺'}
          </div>
        )}
        
        {/* Status Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[stream.status] || STATUS_COLORS['offline']}`}>
            {isLive && (
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse"></span>
            )}
            {stream.status.toUpperCase()}
          </span>
          <span className="px-2 py-1 rounded text-xs font-medium bg-black bg-opacity-50 text-white">
            {PLATFORM_ICONS[stream.platform]} {stream.platform}
          </span>
        </div>

        {/* Viewer Count */}
        {stream.viewerCount !== null && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded text-xs font-medium bg-black bg-opacity-70 text-white">
            👁 {stream.viewerCount.toLocaleString()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-medium text-gray-900 truncate" title={stream.title}>
          {stream.title || 'Untitled Stream'}
        </h3>
        
        <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
          <span>
            {stream.startedAt 
              ? new Date(stream.startedAt).toLocaleDateString()
              : 'Not started'}
          </span>
          <span>{formatDuration(stream.startedAt, stream.endedAt)}</span>
        </div>

        {stream.peakViewerCount !== null && stream.peakViewerCount > 0 && (
          <div className="mt-2 text-xs text-gray-400">
            Peak viewers: {stream.peakViewerCount.toLocaleString()}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {isLive ? (
            <>
              <a
                href={`/dashboard/streams/${stream.id}`}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 text-center"
              >
                View Dashboard
              </a>
              <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Share
              </button>
            </>
          ) : stream.status === 'ended' ? (
            <a
              href={`/dashboard/replays?stream=${stream.id}`}
              className="flex-1 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 text-center"
            >
              View Replay
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
