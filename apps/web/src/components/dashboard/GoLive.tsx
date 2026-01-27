'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface LiveSession {
  id: string;
  title: string | null;
  status: 'preparing' | 'live' | 'ending' | 'ended';
  startedAt: string | null;
  totalPeakViewers: number | null;
  streams: Array<{
    id: string;
    platform: string | null;
    status: string;
    title: string | null;
    peakViewers: number | null;
  }>;
}

interface LiveStatus {
  isLive: boolean;
  session: LiveSession | null;
  restreamConnected: boolean;
  directPlatforms: Array<{
    platform: string;
    connected: boolean;
    displayName: string | null;
  }>;
}

interface RestreamSettings {
  rtmpUrl: string;
  streamKey: string;
  platforms: Array<{
    platform: string;
    displayName: string;
  }>;
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: '🎵',
  youtube: '▶️',
  twitch: '🎮',
  instagram: '📷',
  facebook: '📘',
  twitter: '🐦',
  kick: '💚',
};

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-black text-white',
  youtube: 'bg-red-600 text-white',
  twitch: 'bg-purple-600 text-white',
  instagram: 'bg-pink-600 text-white',
  facebook: 'bg-blue-600 text-white',
  twitter: 'bg-sky-500 text-white',
  kick: 'bg-green-500 text-white',
};

export function GoLive() {
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [restreamSettings, setRestreamSettings] = useState<RestreamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchLiveStatus = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/live-sessions/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch live status');
      }

      const data = await res.json();
      setLiveStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRestreamSettings = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) return;

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/live-sessions/restream-settings`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setRestreamSettings(data);
      }
    } catch {
      // Ignore - Restream might not be connected
    }
  }, []);

  const checkLiveStatus = async () => {
    setChecking(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) return;

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      await fetch(`${apiUrl}/live-sessions/check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      // Refresh status after check
      await fetchLiveStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check status');
    } finally {
      setChecking(false);
    }
  };

  const copyStreamKey = () => {
    if (restreamSettings?.streamKey) {
      navigator.clipboard.writeText(restreamSettings.streamKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  useEffect(() => {
    fetchLiveStatus();
    fetchRestreamSettings();
    
    // Poll for updates when live
    const interval = setInterval(() => {
      if (liveStatus?.isLive) {
        fetchLiveStatus();
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [fetchLiveStatus, fetchRestreamSettings, liveStatus?.isLive]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  // Currently Live
  if (liveStatus?.isLive && liveStatus.session) {
    const session = liveStatus.session;
    const duration = session.startedAt
      ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60)
      : 0;

    return (
      <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
            </span>
            <span className="text-xl font-bold">You're LIVE!</span>
          </div>
          <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
            {duration} min
          </span>
        </div>

        <h3 className="text-lg font-medium mb-2">{session.title || 'Live Stream'}</h3>

        {/* Active Platforms */}
        <div className="flex flex-wrap gap-2 mb-4">
          {session.streams.map((stream) => (
            <span
              key={stream.id}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                PLATFORM_COLORS[stream.platform || ''] || 'bg-gray-700'
              }`}
            >
              {PLATFORM_ICONS[stream.platform || '']} {stream.platform}
              {stream.peakViewers ? ` • ${stream.peakViewers}` : ''}
            </span>
          ))}
        </div>

        <div className="flex gap-3">
          <a
            href="/dashboard/offers"
            className="flex-1 px-4 py-2 bg-white text-red-600 font-medium rounded-lg text-center hover:bg-gray-100"
          >
            Manage Offers
          </a>
          <button
            onClick={checkLiveStatus}
            disabled={checking}
            className="px-4 py-2 bg-white/20 font-medium rounded-lg hover:bg-white/30 disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      </div>
    );
  }

  // Not Live - Show Go Live Guide
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Go Live</h2>
          <button
            onClick={checkLiveStatus}
            disabled={checking}
            className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Check Status'}
          </button>
        </div>

        {/* Connection Status */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Your Connections</h3>
          <div className="flex flex-wrap gap-2">
            {liveStatus?.restreamConnected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Restream Connected
              </span>
            ) : null}
            
            {liveStatus?.directPlatforms.map((p) => (
              <span
                key={p.platform}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  p.connected
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {PLATFORM_ICONS[p.platform]} {p.displayName || p.platform}
                {p.connected && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
            ))}

            {!liveStatus?.restreamConnected && liveStatus?.directPlatforms.length === 0 && (
              <span className="text-gray-500 text-sm">No platforms connected</span>
            )}
          </div>
        </div>

        {/* Restream Settings (if connected) */}
        {liveStatus?.restreamConnected && restreamSettings && (
          <div className="mb-6">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center justify-between w-full p-4 bg-gray-50 rounded-lg hover:bg-gray-100"
            >
              <span className="font-medium text-gray-900">Streaming Settings (for OBS)</span>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${showSettings ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSettings && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RTMP Server URL
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      readOnly
                      value={restreamSettings.rtmpUrl}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-l-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(restreamSettings.rtmpUrl)}
                      className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r-lg text-sm hover:bg-gray-200"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stream Key
                  </label>
                  <div className="flex">
                    <input
                      type="password"
                      readOnly
                      value={restreamSettings.streamKey}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-l-lg text-sm font-mono"
                    />
                    <button
                      onClick={copyStreamKey}
                      className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r-lg text-sm hover:bg-gray-200"
                    >
                      {copiedKey ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Never share your stream key publicly
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Streaming To
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {restreamSettings.platforms.map((p) => (
                      <span
                        key={p.platform}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          PLATFORM_COLORS[p.platform.toLowerCase()] || 'bg-gray-600 text-white'
                        }`}
                      >
                        {PLATFORM_ICONS[p.platform.toLowerCase()]} {p.displayName}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* How to Go Live */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">How to Go Live</h3>
          
          {liveStatus?.restreamConnected ? (
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium">1</span>
                <span>Open OBS, Streamlabs, or your streaming software</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                <span>Add the RTMP URL and Stream Key from settings above</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium">3</span>
                <span>Click "Start Streaming" - we'll automatically detect when you're live!</span>
              </li>
            </ol>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 mb-4">
                Connect Restream to stream to multiple platforms at once, or connect individual platforms.
              </p>
              <a
                href="/dashboard/connections"
                className="inline-flex px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                Connect Platforms
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
