'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChatPanel, LiveStats, QuickActions, ProductQueue } from '@/components/command-center';
import type { ChatMessage, ChatState, ChatPlatform } from '@unifyed/types';

interface SessionStatsData {
  isLive: boolean;
  sessionId?: string;
  title?: string | null;
  duration?: number;
  stats?: {
    revenue: number;
    orders: number;
    checkouts: number;
    conversionRate: number;
    totalViewers: number;
    peakViewers: number;
    viewsByPlatform: Record<string, number>;
  };
}

export default function CommandCenterPage() {
  const supabase = createClient();
  const [chatState, setChatState] = useState<ChatState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<Array<{ id: string; name: string; discount: string; active: boolean }>>([]);
  const [sessionStats, setSessionStats] = useState<SessionStatsData>({ 
    isLive: false,
    stats: { revenue: 0, orders: 0, checkouts: 0, conversionRate: 0, totalViewers: 0, peakViewers: 0, viewsByPlatform: {} }
  });
  const [sessionDuration, setSessionDuration] = useState(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsReconnectRef = useRef<NodeJS.Timeout | null>(null);

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'message':
          setMessages((prev) => [...prev, data.data]);
          break;

        case 'history':
          setMessages(data.data);
          break;

        case 'state':
          setChatState(data.data);
          break;

        case 'session_stats':
          setSessionStats(data.data);
          // Start duration timer if live
          if (data.data.isLive && data.data.duration !== undefined) {
            setSessionDuration(data.data.duration);
            // Clear any existing interval
            if (durationIntervalRef.current) {
              clearInterval(durationIntervalRef.current);
            }
            // Update duration every second
            durationIntervalRef.current = setInterval(() => {
              setSessionDuration((prev) => prev + 1);
            }, 1000);
          } else if (!data.data.isLive && durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
          }
          break;

        case 'sale_notification': {
          // Show sale notification toast
          const sale = data.data;
          const amount = (sale.amount / 100).toFixed(2);
          const notification = {
            id: sale.orderId,
            type: 'sale' as const,
            message: `${sale.customerName} just purchased for $${amount}!`,
            timestamp: sale.timestamp,
          };
          // Add to messages as a system message for visibility
          const saleMessage: ChatMessage = {
            id: `sale-${sale.orderId}`,
            platform: 'restream' as ChatPlatform,
            type: 'system',
            content: `💰 SALE! ${notification.message}`,
            user: {
              id: 'unifyed-system',
              username: 'Unifyed',
              profileImageUrl: undefined,
              badges: [],
              isModerator: false,
              isSubscriber: false,
              isVerified: false,
            },
            timestamp: new Date(sale.timestamp),
          };
          setMessages((prev) => [...prev, saleMessage]);
          // Play notification sound
          try {
            const audio = new Audio('/sounds/sale.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch {
            // Audio might not be available
          }
          break;
        }

        case 'error':
          console.error('Chat error:', data.message);
          setError(data.message);
          break;
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, []);

  // Connect WebSocket to API for session stats and chat messages
  // This runs on page load - independent of "Connect Chat" button
  useEffect(() => {
    let mounted = true;

    const connectWebSocket = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !mounted) return;

        // Close existing connection
        if (wsRef.current) {
          wsRef.current.close();
        }

        const wsUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws')}/chat/ws?token=${session.access_token}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!mounted) { ws.close(); return; }
          console.log('📡 Command Center WebSocket connected');
          setWsConnected(true);
          setError(null);
        };

        ws.onmessage = handleWsMessage;

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setWsConnected(false);
        };

        ws.onclose = () => {
          console.log('📡 Command Center WebSocket disconnected');
          setWsConnected(false);
          // Auto-reconnect after 5 seconds
          if (mounted) {
            wsReconnectRef.current = setTimeout(() => {
              if (mounted) connectWebSocket();
            }, 5000);
          }
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('Failed to connect WebSocket:', err);
        // Retry after 5 seconds
        if (mounted) {
          wsReconnectRef.current = setTimeout(() => {
            if (mounted) connectWebSocket();
          }, 5000);
        }
      }
    };

    connectWebSocket();

    return () => {
      mounted = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (wsReconnectRef.current) {
        clearTimeout(wsReconnectRef.current);
      }
    };
  }, [supabase, handleWsMessage]);

  // Fetch active offers
  useEffect(() => {
    const fetchOffers = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/offers?status=active`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setOffers(data.offers?.map((o: { id: string; name: string; type: string }) => ({
            id: o.id,
            name: o.name,
            discount: o.type,
            active: true,
          })) || []);
        }
      } catch (err) {
        console.error('Failed to fetch offers:', err);
      }
    };

    fetchOffers();
  }, [supabase]);

  // Auto-detect active live session on page load (fallback if WS doesn't connect)
  useEffect(() => {
    const checkLiveStatus = async () => {
      // Skip polling if WS is connected - it handles session stats
      if (wsConnected) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/live-sessions/status`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.isLive && data.session) {
            const startedAt = new Date(data.session.startedAt).getTime();
            const duration = Math.floor((Date.now() - startedAt) / 1000);

            setSessionStats({
              isLive: true,
              sessionId: data.session.id,
              title: data.session.title,
              duration,
              stats: {
                revenue: 0,
                orders: 0,
                checkouts: 0,
                conversionRate: 0,
                totalViewers: data.session.totalPeakViewers || 0,
                peakViewers: data.session.totalPeakViewers || 0,
                viewsByPlatform: data.session.viewsByPlatform || {},
              },
            });
            setSessionDuration(duration);

            if (durationIntervalRef.current) {
              clearInterval(durationIntervalRef.current);
            }
            durationIntervalRef.current = setInterval(() => {
              setSessionDuration((prev) => prev + 1);
            }, 1000);
          }
        }
      } catch (err) {
        console.error('Failed to check live status:', err);
      }
    };

    // Check immediately
    checkLiveStatus();

    // Poll every 15 seconds as fallback
    const pollInterval = setInterval(checkLiveStatus, 15000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [supabase, wsConnected]);

  // Start chat aggregation (Restream chat connection)
  // This is separate from the WebSocket - it starts the actual chat bridge to Restream
  const connectChat = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to access the command center');
        return;
      }

      // Start chat aggregation via API
      const startResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!startResponse.ok) {
        const data = await startResponse.json();
        const errorMsg = data.error?.message || data.message || 'Failed to start chat';
        console.error('Chat start failed:', errorMsg);
        setError(`Chat connection issue: ${errorMsg}. Live stats still active.`);
        setIsConnecting(false);
        return;
      }

      const result = await startResponse.json();
      console.log('💬 Chat aggregation started:', result);
      setChatStarted(true);

      // Update chat state from response
      if (result.state) {
        setChatState(result.state);
      }

      setIsConnecting(false);
    } catch (err) {
      console.error('Failed to connect chat:', err);
      setError(err instanceof Error ? `Chat error: ${err.message}. Live stats still active.` : 'Failed to connect chat');
      setIsConnecting(false);
    }
  }, [supabase]);

  // Disconnect chat
  const disconnectChat = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Stop chat aggregation on API side
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/stop`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }).catch(() => {});
      }
    } catch {
      // Ignore errors on disconnect
    }
    setChatState(null);
    setChatStarted(false);
    setMessages([]);
  }, [supabase]);

  // Send message
  const sendMessage = useCallback((content: string, platforms?: ChatPlatform[]) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'send',
        content,
        platforms,
      }));

      // Optimistic: show the message locally immediately
      const localMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        platform: 'restream' as ChatPlatform,
        type: 'chat',
        content,
        user: {
          id: 'local-user',
          username: 'You',
          profileImageUrl: undefined,
          badges: [],
          isModerator: false,
          isSubscriber: false,
          isVerified: false,
        },
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, localMessage]);
    } else {
      setError('WebSocket not connected. Try refreshing the page.');
    }
  }, []);

  // Handle pin offer
  const handlePinOffer = useCallback(async (offerId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to pin offers');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat-commerce/pin-offer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offerId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to pin offer');
      }

      console.log('Offer pinned successfully');
    } catch (err) {
      console.error('Failed to pin offer:', err);
      setError(err instanceof Error ? err.message : 'Failed to pin offer');
    }
  }, [supabase]);

  // Handle drop link
  const handleDropLink = useCallback(async (offerId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to drop links');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat-commerce/drop-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offerId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to drop link');
      }

      console.log('Link dropped successfully');
    } catch (err) {
      console.error('Failed to drop link:', err);
      setError(err instanceof Error ? err.message : 'Failed to drop link');
    }
  }, [supabase]);

  // Handle flash sale
  const handleFlashSale = useCallback(async (offerId: string, duration: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to start flash sales');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat-commerce/flash-sale`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          offerId, 
          durationMinutes: duration,
          additionalDiscount: 10,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to start flash sale');
      }

      console.log('Flash sale started successfully');
    } catch (err) {
      console.error('Failed to start flash sale:', err);
      setError(err instanceof Error ? err.message : 'Failed to start flash sale');
    }
  }, [supabase]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const isSessionLive = sessionStats.isLive || false;
  const isChatConnected = chatStarted || !!chatState?.isLive;
  const isLive = isSessionLive || isChatConnected;

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-gray-400 mt-1">
            Unified chat control across all your streaming platforms
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* WebSocket connection indicator */}
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
            wsConnected ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
            {wsConnected ? 'Connected' : 'Reconnecting...'}
          </div>

          {isChatConnected ? (
            <button
              onClick={disconnectChat}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Disconnect Chat
            </button>
          ) : (
            <button
              onClick={connectChat}
              disabled={isConnecting}
              className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-colors font-medium ${
                isSessionLive 
                  ? 'bg-green-600 hover:bg-green-700 animate-pulse' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isConnecting ? 'Connecting...' : isSessionLive ? 'Connect Chat (LIVE!)' : 'Connect Chat'}
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 ml-4 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-180px)]">
        {/* Left sidebar - Stats */}
        <div className="col-span-3 space-y-4">
          <LiveStats
            chatState={chatState}
            revenue={sessionStats.stats?.revenue || 0}
            orders={sessionStats.stats?.orders || 0}
            conversionRate={sessionStats.stats?.conversionRate || 0}
            peakViewers={sessionStats.stats?.peakViewers || 0}
            duration={sessionDuration}
            isLive={sessionStats.isLive}
            sessionTitle={sessionStats.title || undefined}
          />
          <QuickActions
            offers={offers}
            isLive={isLive}
            onPinOffer={handlePinOffer}
            onDropLink={handleDropLink}
            onFlashSale={handleFlashSale}
          />
        </div>

        {/* Center - Chat */}
        <div className="col-span-6 relative">
          <ChatPanel
            messages={messages}
            chatState={chatState}
            onSendMessage={sendMessage}
            onPinProduct={(msg) => {
              console.log('Pin product from message:', msg);
            }}
          />
        </div>

        {/* Right sidebar - Product Queue + Activity */}
        <div className="col-span-3 flex flex-col gap-4 h-full">
          {/* Product Queue - top half */}
          <div className="flex-1 min-h-0">
            <ProductQueue
              sessionId={sessionStats.sessionId}
              isLive={isLive}
            />
          </div>

          {/* Activity Feed - bottom half */}
          <div className="flex-1 min-h-0">
            <div className="bg-gray-900 rounded-lg p-4 h-full overflow-y-auto">
              <h3 className="font-semibold text-white text-sm mb-4">Activity Feed</h3>
              
              {/* Gift/donation feed */}
              <div className="space-y-2">
                {messages
                  .filter((m) => ['gift', 'subscription', 'raid'].includes(m.type))
                  .slice(-10)
                  .reverse()
                  .map((msg) => (
                    <div
                      key={msg.id}
                      className="p-2 bg-gray-800/50 rounded text-sm"
                    >
                      <span className="font-medium text-yellow-400">
                        {msg.type === 'gift' && '🎁'}
                        {msg.type === 'subscription' && '⭐'}
                        {msg.type === 'raid' && '🚀'}
                      </span>
                      <span className="text-gray-300 ml-1">
                        {msg.user.username}
                      </span>
                      <span className="text-gray-500 ml-1 text-xs">
                        {msg.content}
                      </span>
                    </div>
                  ))}
                
                {messages.filter((m) => ['gift', 'subscription', 'raid'].includes(m.type)).length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-4">
                    No activity yet
                  </div>
                )}
              </div>

              {/* Buying intent signals */}
              <div className="mt-4 pt-3 border-t border-gray-800">
                <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Buying Signals</h4>
                <div className="space-y-2">
                  {messages
                    .filter((m) => m.signals?.hasBuyingIntent)
                    .slice(-5)
                    .reverse()
                    .map((msg) => (
                      <div
                        key={msg.id}
                        className="p-2 bg-green-500/10 border border-green-500/30 rounded text-sm"
                      >
                        <span className="font-medium text-green-400">
                          {msg.user.username}:
                        </span>
                        <span className="text-gray-300 ml-1 text-xs">
                          {msg.content.slice(0, 50)}...
                        </span>
                      </div>
                    ))}
                  
                  {messages.filter((m) => m.signals?.hasBuyingIntent).length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-2">
                      AI will detect buying intent
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
