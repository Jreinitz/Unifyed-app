'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/client';

interface Replay {
  id: string;
  title: string;
  description: string | null;
  platform: string;
  platformVideoId: string;
  status: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  publishedAt: string | null;
  isPublic: boolean;
  createdAt: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: '🎵',
  youtube: '▶️',
  twitch: '🎮',
  instagram: '📷',
};

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-gray-100 text-gray-600',
  private: 'bg-purple-100 text-purple-700',
};

export default function ReplaysPage() {
  const [replays, setReplays] = useState<Replay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReplay, setSelectedReplay] = useState<Replay | null>(null);

  const fetchReplays = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/replays?limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch replays');
      }

      const data = await res.json();
      setReplays(data.replays || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load replays');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReplays();
  }, [fetchReplays]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/replays/sync`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      if (!res.ok) {
        throw new Error('Failed to sync replays');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      fetchReplays();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyLink = (replay: Replay) => {
    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000';
    const link = `${appUrl}/r/${replay.id}`;
    navigator.clipboard.writeText(link);
    // Could show a toast here
  };

  const filteredReplays = replays.filter(replay =>
    replay.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
          title="Replays" 
          subtitle="Manage your VODs and create shoppable replays"
          actions={
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Import from Platforms'}
            </button>
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

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search replays..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Replays Grid */}
        {filteredReplays.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="text-4xl mb-4">🎬</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No replays yet</h3>
            <p className="text-gray-500 mb-4">
              Import VODs from your connected platforms or complete a live stream.
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Import Replays'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredReplays.map((replay) => (
              <ReplayCard
                key={replay.id}
                replay={replay}
                onSelect={() => setSelectedReplay(replay)}
                onCopyLink={() => handleCopyLink(replay)}
                formatDuration={formatDuration}
              />
            ))}
          </div>
        )}

        {/* Replay Detail Modal */}
        {selectedReplay && (
          <ReplayModal
            replay={selectedReplay}
            onClose={() => setSelectedReplay(null)}
            onCopyLink={() => handleCopyLink(selectedReplay)}
            formatDuration={formatDuration}
          />
        )}
      </div>
    </div>
  );
}

interface ReplayCardProps {
  replay: Replay;
  onSelect: () => void;
  onCopyLink: () => void;
  formatDuration: (seconds: number | null) => string;
}

function ReplayCard({ replay, onSelect, onCopyLink, formatDuration }: ReplayCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div 
        className="aspect-video bg-gray-900 relative cursor-pointer"
        onClick={onSelect}
      >
        {replay.thumbnailUrl ? (
          <img 
            src={replay.thumbnailUrl} 
            alt={replay.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {PLATFORM_ICONS[replay.platform] || '🎬'}
          </div>
        )}
        
        {/* Duration */}
        {replay.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded text-xs font-medium bg-black bg-opacity-70 text-white">
            {formatDuration(replay.duration)}
          </div>
        )}

        {/* Platform Badge */}
        <div className="absolute top-2 left-2">
          <span className="px-2 py-1 rounded text-xs font-medium bg-black bg-opacity-50 text-white">
            {PLATFORM_ICONS[replay.platform]} {replay.platform}
          </span>
        </div>

        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[replay.status] || STATUS_COLORS['draft']}`}>
            {replay.status}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 
          className="font-medium text-gray-900 truncate cursor-pointer hover:text-indigo-600" 
          title={replay.title}
          onClick={onSelect}
        >
          {replay.title || 'Untitled Replay'}
        </h3>
        
        <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
          <span>
            {replay.publishedAt 
              ? new Date(replay.publishedAt).toLocaleDateString()
              : new Date(replay.createdAt).toLocaleDateString()}
          </span>
          {replay.viewCount !== null && (
            <span>👁 {replay.viewCount.toLocaleString()}</span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <a
            href={`/r/${replay.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 text-center"
          >
            Preview
          </a>
          <button 
            onClick={onCopyLink}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Copy Link
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReplayModalProps {
  replay: Replay;
  onClose: () => void;
  onCopyLink: () => void;
  formatDuration: (seconds: number | null) => string;
}

function ReplayModal({ replay, onClose, onCopyLink, formatDuration }: ReplayModalProps) {
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000';
  const replayUrl = `${appUrl}/r/${replay.id}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{replay.title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          {/* Video Preview */}
          <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden mb-4">
            {replay.thumbnailUrl ? (
              <img 
                src={replay.thumbnailUrl} 
                alt={replay.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl">
                {PLATFORM_ICONS[replay.platform] || '🎬'}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {replay.viewCount?.toLocaleString() || '0'}
              </div>
              <div className="text-xs text-gray-500">Views</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {replay.likeCount?.toLocaleString() || '0'}
              </div>
              <div className="text-xs text-gray-500">Likes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {formatDuration(replay.duration)}
              </div>
              <div className="text-xs text-gray-500">Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl">
                {PLATFORM_ICONS[replay.platform]}
              </div>
              <div className="text-xs text-gray-500 capitalize">{replay.platform}</div>
            </div>
          </div>

          {/* Description */}
          {replay.description && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
              <p className="text-sm text-gray-600">{replay.description}</p>
            </div>
          )}

          {/* Shoppable Link */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Shoppable Replay Link</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={replayUrl}
                className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg"
              />
              <button
                onClick={onCopyLink}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
            <a
              href={`/r/${replay.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              View Public Page
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
