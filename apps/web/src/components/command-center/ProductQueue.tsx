'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface QueueProduct {
  productId: string;
  title: string;
  imageUrl: string | null;
  price: string;
  offerId?: string;
  shortLinkCode?: string;
}

interface ProductQueueProps {
  sessionId: string | undefined;
  isLive: boolean;
}

export function ProductQueue({ sessionId, isLive }: ProductQueueProps) {
  const [queueItems, setQueueItems] = useState<QueueProduct[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoDropEnabled, setAutoDropEnabled] = useState(false);
  const [autoDropInterval, setAutoDropInterval] = useState(5);
  const [lastDroppedAt, setLastDroppedAt] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getToken = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, []);

  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

  // Fetch queue state
  const fetchQueue = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${apiUrl}/live-sessions/${sessionId}/queue`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setQueueItems(data.queue.items || []);
        setCurrentIndex(data.queue.currentIndex || 0);
        setAutoDropEnabled(data.queue.autoDropEnabled || false);
        setAutoDropInterval(data.queue.autoDropIntervalMinutes || 5);
        setLastDroppedAt(data.queue.lastDroppedAt || null);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [sessionId, getToken, apiUrl]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Auto-drop timer
  useEffect(() => {
    if (!autoDropEnabled || !isLive || queueItems.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      setCountdown(null);
      return;
    }

    const intervalMs = autoDropInterval * 60 * 1000;
    let lastDrop = lastDroppedAt ? new Date(lastDroppedAt).getTime() : Date.now();

    const tick = () => {
      const elapsed = Date.now() - lastDrop;
      const remaining = Math.max(0, intervalMs - elapsed);
      setCountdown(Math.ceil(remaining / 1000));

      if (remaining <= 0) {
        handleDrop();
        lastDrop = Date.now();
      }
    };

    timerRef.current = setInterval(tick, 1000);
    tick();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDropEnabled, autoDropInterval, isLive, queueItems.length, lastDroppedAt]);

  // Drop current product link
  const handleDrop = useCallback(async () => {
    if (!sessionId || dropping) return;
    try {
      setDropping(true);
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${apiUrl}/live-sessions/${sessionId}/queue/drop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLastDroppedAt(data.droppedAt);
      }
    } catch {
      // Silently fail
    } finally {
      setDropping(false);
    }
  }, [sessionId, dropping, getToken, apiUrl]);

  // Next product
  const handleNext = useCallback(async () => {
    if (!sessionId) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${apiUrl}/live-sessions/${sessionId}/queue/next`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentIndex(data.queue.currentIndex);
        setLastDroppedAt(null);
      }
    } catch {
      // Silently fail
    }
  }, [sessionId, getToken, apiUrl]);

  // Spotlight specific product
  const handleSpotlight = useCallback(async (index: number) => {
    if (!sessionId) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${apiUrl}/live-sessions/${sessionId}/queue/spotlight`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ index }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentIndex(data.queue.currentIndex);
        setLastDroppedAt(null);
      }
    } catch {
      // Silently fail
    }
  }, [sessionId, getToken, apiUrl]);

  // Toggle auto-drop
  const toggleAutoDrop = useCallback(async () => {
    if (!sessionId) return;
    try {
      const token = await getToken();
      if (!token) return;

      const newEnabled = !autoDropEnabled;
      const res = await fetch(`${apiUrl}/live-sessions/${sessionId}/queue/settings`, {
        method: 'PATCH',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          autoDropEnabled: newEnabled,
          autoDropIntervalMinutes: autoDropInterval,
        }),
      });

      if (res.ok) {
        setAutoDropEnabled(newEnabled);
        if (newEnabled) {
          setLastDroppedAt(new Date().toISOString());
        }
      }
    } catch {
      // Silently fail
    }
  }, [sessionId, autoDropEnabled, autoDropInterval, getToken, apiUrl]);

  const currentProduct = queueItems[currentIndex];

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!sessionId) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 h-full">
        <h3 className="font-semibold text-white text-sm mb-4">Product Queue</h3>
        <div className="text-center text-gray-500 text-sm py-8">
          Start a session to use the product queue
        </div>
      </div>
    );
  }

  if (loading && queueItems.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 h-full">
        <h3 className="font-semibold text-white text-sm mb-4">Product Queue</h3>
        <div className="text-center text-gray-500 text-sm py-8">
          Loading queue...
        </div>
      </div>
    );
  }

  if (queueItems.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 h-full">
        <h3 className="font-semibold text-white text-sm mb-4">Product Queue</h3>
        <div className="text-center text-gray-500 text-sm py-8">
          No products in queue. Add products during session preparation.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white text-sm">Product Queue</h3>
        <span className="text-xs text-gray-500">
          {currentIndex + 1} / {queueItems.length}
        </span>
      </div>

      {/* Current Product Spotlight */}
      {currentProduct && (
        <div className="bg-gray-800 rounded-lg p-3 mb-3 border border-indigo-500/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">SPOTLIGHT</span>
          </div>
          {currentProduct.imageUrl && (
            <div className="w-full h-24 bg-gray-700 rounded-lg mb-2 overflow-hidden">
              <img 
                src={currentProduct.imageUrl} 
                alt={currentProduct.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <p className="text-white text-sm font-medium truncate">{currentProduct.title}</p>
          {currentProduct.price && (
            <p className="text-green-400 text-xs mt-0.5">{currentProduct.price}</p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleDrop}
              disabled={dropping}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {dropping ? 'Dropping...' : 'Drop Link'}
            </button>
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Auto-drop controls */}
      <div className="bg-gray-800/50 rounded-lg p-2.5 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Auto-drop</span>
          <button
            onClick={toggleAutoDrop}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              autoDropEnabled ? 'bg-indigo-600' : 'bg-gray-600'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              autoDropEnabled ? 'left-[18px]' : 'left-0.5'
            }`} />
          </button>
        </div>
        {autoDropEnabled && countdown !== null && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-xs text-gray-500">Every {autoDropInterval}min</span>
            <span className="text-xs text-indigo-400 font-mono">
              {formatCountdown(countdown)}
            </span>
          </div>
        )}
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {queueItems.map((item, index) => (
          <button
            key={`${item.productId}-${index}`}
            onClick={() => handleSpotlight(index)}
            className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
              index === currentIndex 
                ? 'bg-indigo-600/20 border border-indigo-500/40' 
                : 'bg-gray-800/30 hover:bg-gray-800/60'
            }`}
          >
            {item.imageUrl ? (
              <img 
                src={item.imageUrl} 
                alt={item.title}
                className="w-8 h-8 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded bg-gray-700 flex-shrink-0 flex items-center justify-center text-xs text-gray-500">
                {index + 1}
              </div>
            )}
            <span className={`text-xs truncate ${
              index === currentIndex ? 'text-white font-medium' : 'text-gray-400'
            }`}>
              {item.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
