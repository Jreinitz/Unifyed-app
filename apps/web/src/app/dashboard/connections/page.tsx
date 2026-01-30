'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard';
import { createClient } from '@/lib/supabase/client';

interface PlatformConnection {
  id: string;
  platform: string;
  displayName: string;
  status: string;
  lastSyncAt: string | null;
}

interface StreamingToolConnection {
  id: string;
  tool: string;
  displayName: string;
  status: string;
  lastSyncAt: string | null;
}

interface ConnectionsData {
  platforms: PlatformConnection[];
  streamingTools: StreamingToolConnection[];
}

const PLATFORM_INFO: Record<string, { name: string; description: string; icon: string; color: string }> = {
  shopify: {
    name: 'Shopify',
    description: 'Connect your Shopify store to sync products and track orders',
    icon: '🛒',
    color: 'bg-green-500',
  },
  tiktok: {
    name: 'TikTok',
    description: 'Connect to track live streams and detect when you go live',
    icon: '🎵',
    color: 'bg-black',
  },
  youtube: {
    name: 'YouTube',
    description: 'Connect to track live streams and import VODs',
    icon: '▶️',
    color: 'bg-red-500',
  },
  twitch: {
    name: 'Twitch',
    description: 'Connect to track live streams and import VODs',
    icon: '🎮',
    color: 'bg-purple-500',
  },
  instagram: {
    name: 'Instagram',
    description: 'Connect for Instagram Live shopping features',
    icon: '📷',
    color: 'bg-pink-500',
  },
};

const STREAMING_TOOL_INFO: Record<string, { name: string; description: string; icon: string; color: string }> = {
  restream: {
    name: 'Restream',
    description: 'Multi-stream to all platforms at once',
    icon: '📡',
    color: 'bg-blue-600',
  },
  streamyard: {
    name: 'StreamYard',
    description: 'Professional browser-based streaming',
    icon: '🎬',
    color: 'bg-indigo-500',
  },
  obs: {
    name: 'OBS Studio',
    description: 'Connect via RTMP for advanced streaming',
    icon: '🖥️',
    color: 'bg-gray-700',
  },
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState('');
  const supabase = createClient();

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, [supabase.auth]);

  const fetchConnections = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      // Fetch platform connections
      const platformRes = await fetch(`${apiUrl}/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Fetch streaming tool connections
      const toolsRes = await fetch(`${apiUrl}/connections/tools`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!platformRes.ok || !toolsRes.ok) {
        throw new Error('Failed to fetch connections');
      }

      const platformData = await platformRes.json();
      const toolsData = await toolsRes.json();

      setConnections({
        platforms: platformData.connections || [],
        streamingTools: toolsData.connections || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const platform = params.get('platform');
    
    if (success === 'true' && platform) {
      // Refresh connections after OAuth
      fetchConnections();
      // Clean URL
      window.history.replaceState({}, '', '/dashboard/connections');
    }
  }, [fetchConnections]);

  const handleConnect = async (platform: string, type: 'platform' | 'tool', shopDomain?: string) => {
    // For Shopify, show modal to get shop domain first
    if (platform === 'shopify' && !shopDomain) {
      setShowShopifyModal(true);
      return;
    }

    try {
      setConnectingPlatform(platform);
      const token = await getToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }
      
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      let endpoint = type === 'platform' 
        ? `${apiUrl}/connections/${platform}/auth-url`
        : `${apiUrl}/connections/tools/${platform}/auth-url`;
      
      // Add shop domain for Shopify
      if (platform === 'shopify' && shopDomain) {
        endpoint += `?shop=${encodeURIComponent(shopDomain)}`;
      }
      
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to get auth URL');
      }

      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setConnectingPlatform(null);
    }
  };

  const handleShopifyConnect = () => {
    if (!shopifyDomain.trim()) {
      setError('Please enter your Shopify store domain');
      return;
    }
    // Clean up the domain - remove .myshopify.com if they included it
    let cleanDomain = shopifyDomain.trim().toLowerCase();
    cleanDomain = cleanDomain.replace(/\.myshopify\.com$/, '');
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
    
    setShowShopifyModal(false);
    handleConnect('shopify', 'platform', cleanDomain);
  };

  const handleDisconnect = async (connectionId: string, type: 'platform' | 'tool') => {
    if (!confirm('Are you sure you want to disconnect this account?')) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }
      
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const endpoint = type === 'platform'
        ? `${apiUrl}/connections/${connectionId}`
        : `${apiUrl}/connections/tools/${connectionId}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to disconnect');
      }

      fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const getConnectionForPlatform = (platform: string) => {
    return connections?.platforms.find(c => c.platform === platform);
  };

  const getConnectionForTool = (tool: string) => {
    return connections?.streamingTools.find(c => c.tool === tool);
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
          title="Connections" 
          subtitle="Connect your e-commerce platforms and streaming accounts"
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button 
              onClick={() => setError(null)}
              className="ml-4 text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Shopify Store Domain Modal */}
        {showShopifyModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect Shopify Store</h3>
              <p className="text-sm text-gray-600 mb-4">
                Enter your Shopify store domain to connect your store.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Store Domain
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={shopifyDomain}
                    onChange={(e) => setShopifyDomain(e.target.value)}
                    placeholder="your-store"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleShopifyConnect()}
                  />
                  <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500 text-sm">
                    .myshopify.com
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Example: if your store URL is my-store.myshopify.com, enter &quot;my-store&quot;
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowShopifyModal(false);
                    setShopifyDomain('');
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShopifyConnect}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Connect Store
                </button>
              </div>
            </div>
          </div>
        )}

        {/* E-commerce Platforms */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">E-commerce Platforms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(PLATFORM_INFO)
              .filter(([key]) => key === 'shopify')
              .map(([platform, info]) => {
                const connection = getConnectionForPlatform(platform);
                const isConnecting = connectingPlatform === platform;
                
                return (
                  <ConnectionCard
                    key={platform}
                    name={info.name}
                    description={info.description}
                    icon={info.icon}
                    color={info.color}
                    connection={connection}
                    isConnecting={isConnecting}
                    onConnect={() => handleConnect(platform, 'platform')}
                    onDisconnect={() => connection && handleDisconnect(connection.id, 'platform')}
                  />
                );
              })}
          </div>
        </section>

        {/* Streaming Platforms */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Streaming Platforms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(PLATFORM_INFO)
              .filter(([key]) => ['tiktok', 'youtube', 'twitch', 'instagram'].includes(key))
              .map(([platform, info]) => {
                const connection = getConnectionForPlatform(platform);
                const isConnecting = connectingPlatform === platform;
                const isComingSoon = platform === 'instagram';
                
                return (
                  <ConnectionCard
                    key={platform}
                    name={info.name}
                    description={info.description}
                    icon={info.icon}
                    color={info.color}
                    connection={connection}
                    isConnecting={isConnecting}
                    isComingSoon={isComingSoon}
                    onConnect={() => handleConnect(platform, 'platform')}
                    onDisconnect={() => connection && handleDisconnect(connection.id, 'platform')}
                  />
                );
              })}
          </div>
        </section>

        {/* Multi-Platform Streaming Tools */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Multi-Platform Streaming Tools</h2>
          <p className="text-sm text-gray-600 mb-4">
            Connect a streaming tool to automatically track streams across all platforms at once.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(STREAMING_TOOL_INFO).map(([tool, info]) => {
              const connection = getConnectionForTool(tool);
              const isConnecting = connectingPlatform === tool;
              const isComingSoon = tool === 'streamyard' || tool === 'obs';
              
              return (
                <ConnectionCard
                  key={tool}
                  name={info.name}
                  description={info.description}
                  icon={info.icon}
                  color={info.color}
                  connection={connection}
                  isConnecting={isConnecting}
                  isComingSoon={isComingSoon}
                  onConnect={() => handleConnect(tool, 'tool')}
                  onDisconnect={() => connection && handleDisconnect(connection.id, 'tool')}
                />
              );
            })}
          </div>
        </section>

        {/* Payments Section */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payments</h2>
          <p className="text-sm text-gray-600 mb-4">
            Connect Stripe to receive payments directly to your account.
          </p>
          <StripeConnectCard />
        </section>
      </div>
    </div>
  );
}

interface ConnectionCardProps {
  name: string;
  description: string;
  icon: string;
  color: string;
  connection?: PlatformConnection | StreamingToolConnection;
  isConnecting: boolean;
  isComingSoon?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ConnectionCard({
  name,
  description,
  icon,
  color,
  connection,
  isConnecting,
  isComingSoon,
  onConnect,
  onDisconnect,
}: ConnectionCardProps) {
  const isConnected = connection?.status === 'connected';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center text-2xl`}>
            {icon}
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{name}</h3>
            {isConnected && connection.displayName && (
              <p className="text-sm text-gray-500">{connection.displayName}</p>
            )}
          </div>
        </div>
        {isConnected && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Connected
          </span>
        )}
      </div>
      
      <p className="mt-3 text-sm text-gray-600">{description}</p>

      {connection?.lastSyncAt && (
        <p className="mt-2 text-xs text-gray-400">
          Last synced: {new Date(connection.lastSyncAt).toLocaleDateString()}
        </p>
      )}

      <div className="mt-4">
        {isComingSoon ? (
          <button
            disabled
            className="w-full px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
          >
            Coming Soon
          </button>
        ) : isConnected ? (
          <div className="flex gap-2">
            <button
              onClick={onConnect}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Reconnect
            </button>
            <button
              onClick={onDisconnect}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

function StripeConnectCard() {
  const [status, setStatus] = useState<{
    connected: boolean;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchStatus = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/payments/connect/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const token = await getToken();
      if (!token) {
        console.error('No session token available');
        return;
      }
      
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/payments/connect/onboard`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to start onboarding');
      }

      const data = await res.json();
      
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else if (data.status === 'active') {
        fetchStatus();
      }
    } catch (err) {
      console.error('Connect error:', err);
    } finally {
      setConnecting(false);
    }
  };

  const handleDashboard = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      
      const res = await fetch(`${apiUrl}/payments/connect/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        window.open(data.dashboardUrl, '_blank');
      }
    } catch (err) {
      console.error('Dashboard error:', err);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  const isFullySetup = status?.connected && status.chargesEnabled && status.detailsSubmitted;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-2xl">
            💳
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Stripe</h3>
            {status?.connected && (
              <p className="text-sm text-gray-500">
                {isFullySetup ? 'Ready to receive payments' : 'Setup incomplete'}
              </p>
            )}
          </div>
        </div>
        {status?.connected && (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            isFullySetup ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {isFullySetup ? 'Active' : 'Pending'}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-gray-600">
        Connect Stripe to receive direct payments from customers. 10% platform fee on sales.
      </p>

      {status?.connected && (
        <div className="mt-3 flex gap-2 text-xs">
          <span className={`px-2 py-1 rounded ${status.chargesEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {status.chargesEnabled ? '✓ Charges' : '○ Charges'}
          </span>
          <span className={`px-2 py-1 rounded ${status.payoutsEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {status.payoutsEnabled ? '✓ Payouts' : '○ Payouts'}
          </span>
        </div>
      )}

      <div className="mt-4">
        {isFullySetup ? (
          <div className="flex gap-2">
            <button
              onClick={handleDashboard}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              View Dashboard
            </button>
            <button
              onClick={handleConnect}
              className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              Update
            </button>
          </div>
        ) : status?.connected ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {connecting ? 'Loading...' : 'Complete Setup'}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {connecting ? 'Loading...' : 'Connect Stripe'}
          </button>
        )}
      </div>
    </div>
  );
}
