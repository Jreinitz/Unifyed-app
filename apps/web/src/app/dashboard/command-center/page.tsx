'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChatPanel, LiveStats, QuickActions } from '@/components/command-center';
import type { ChatMessage, ChatState, ChatPlatform } from '@unifyed/types';

export default function CommandCenterPage() {
  const supabase = createClient();
  const [chatState, setChatState] = useState<ChatState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<Array<{ id: string; name: string; discount: string; active: boolean }>>([]);
  const [sessionStats, setSessionStats] = useState({ revenue: 0, orders: 0, conversionRate: 0 });
  
  const wsRef = useRef<WebSocket | null>(null);

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

  // Connect to chat WebSocket
  const connectChat = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to access the command center');
        return;
      }

      // First, start chat via API
      const startResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!startResponse.ok) {
        const data = await startResponse.json();
        throw new Error(data.message || 'Failed to start chat');
      }

      // Connect to WebSocket
      const wsUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws')}/chat/ws?token=${session.access_token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('💬 Chat WebSocket connected');
        setIsConnecting(false);
      };

      ws.onmessage = (event) => {
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

            case 'error':
              console.error('Chat error:', data.message);
              setError(data.message);
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error. Please try again.');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        console.log('💬 Chat WebSocket disconnected');
        setChatState(null);
        setIsConnecting(false);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to connect chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  }, [supabase]);

  // Disconnect chat
  const disconnectChat = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setChatState(null);
    setMessages([]);
  }, []);

  // Send message
  const sendMessage = useCallback((content: string, platforms?: ChatPlatform[]) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'send',
        content,
        platforms,
      }));
    }
  }, []);

  // Handle pin offer
  const handlePinOffer = useCallback((offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (offer) {
      sendMessage(`📌 Check out: ${offer.name} - ${offer.discount} off! Click the link below to get this deal!`);
    }
  }, [offers, sendMessage]);

  // Handle drop link
  const handleDropLink = useCallback((offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (offer) {
      // In production, this would generate a trackable short link
      sendMessage(`🔗 Get ${offer.discount} off now: unifyed.link/${offerId.slice(0, 8)}`);
    }
  }, [offers, sendMessage]);

  // Handle flash sale
  const handleFlashSale = useCallback((offerId: string, duration: number) => {
    const offer = offers.find((o) => o.id === offerId);
    if (offer) {
      sendMessage(`⚡ FLASH SALE! ${offer.name} - ${offer.discount} off for the next ${duration} minutes ONLY! 🔥`);
    }
  }, [offers, sendMessage]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const isLive = chatState?.isLive || false;

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
          {isLive ? (
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
            >
              {isConnecting ? 'Connecting...' : 'Connect Chat'}
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-180px)]">
        {/* Left sidebar - Stats */}
        <div className="col-span-3 space-y-4">
          <LiveStats
            chatState={chatState}
            revenue={sessionStats.revenue}
            orders={sessionStats.orders}
            conversionRate={sessionStats.conversionRate}
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
              // Would open product picker
            }}
          />
        </div>

        {/* Right sidebar - Activity feed */}
        <div className="col-span-3">
          <div className="bg-gray-900 rounded-lg p-4 h-full">
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
                <div className="text-center text-gray-500 text-sm py-8">
                  No activity yet
                </div>
              )}
            </div>

            {/* Buying intent signals */}
            <div className="mt-6 pt-4 border-t border-gray-800">
              <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-2">🎯 Buying Signals</h4>
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
                      <span className="text-gray-300 ml-1">
                        {msg.content.slice(0, 50)}...
                      </span>
                    </div>
                  ))}
                
                {messages.filter((m) => m.signals?.hasBuyingIntent).length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-4">
                    AI will detect buying intent
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
