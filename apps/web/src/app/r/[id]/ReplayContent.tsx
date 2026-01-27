'use client';

import { useEffect, useState, useCallback } from 'react';
import { VideoPlayer } from '@/components/VideoPlayer';
import { MomentsTimeline } from '@/components/MomentsTimeline';
import { ProductCard } from '@/components/ProductCard';

interface Moment {
  id: string;
  title: string;
  description: string | null;
  timestamp: number;
  thumbnailUrl: string | null;
}

interface OfferProduct {
  id: string;
  title: string;
  imageUrl: string | null;
  originalPrice: number;
  offerPrice: number;
  currency: string;
  shortLinkCode: string;
  shortLinkUrl: string;
}

interface Offer {
  id: string;
  name: string;
  description: string | null;
  type: string;
  value: number;
  badgeText: string | null;
  products: OfferProduct[];
}

interface Creator {
  name: string;
  handle: string | null;
  avatarUrl: string | null;
}

interface Replay {
  id: string;
  title: string | null;
  description: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  slug: string | null;
  viewCount: number;
  platform: string | null;
  publishedAt: string | null;
  creator: Creator;
  moments: Moment[];
  offers: Offer[];
}

interface ReplayContentProps {
  replay: Replay;
  apiUrl: string;
}

// Get or create visitor ID
function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  
  let visitorId = localStorage.getItem('unifyed_visitor_id');
  if (!visitorId) {
    visitorId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('unifyed_visitor_id', visitorId);
  }
  return visitorId;
}

export function ReplayContent({ replay, apiUrl }: ReplayContentProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [hasTrackedView, setHasTrackedView] = useState(false);

  // Track view on mount
  useEffect(() => {
    if (hasTrackedView) return;
    
    const visitorId = getVisitorId();
    
    fetch(`${apiUrl}/public/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'REPLAY_VIEW',
        payload: {
          replayId: replay.id,
          visitorId,
          referrer: document.referrer || null,
        },
      }),
    }).catch((err) => console.error('Failed to track view:', err));
    
    setHasTrackedView(true);
  }, [apiUrl, replay.id, hasTrackedView]);

  // Handle buy button click
  const handleProductClick = useCallback((product: OfferProduct, offer: Offer, momentId?: string) => {
    const visitorId = getVisitorId();
    
    // Track click event (async, don't block navigation)
    fetch(`${apiUrl}/public/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'REPLAY_CLICK',
        payload: {
          replayId: replay.id,
          shortLinkId: product.shortLinkCode, // This will need to be the actual ID
          momentId: momentId || null,
          visitorId,
        },
      }),
    }).catch((err) => console.error('Failed to track click:', err));
  }, [apiUrl, replay.id]);

  // Handle video time updates
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Format duration
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Video Player Section */}
      <div className="w-full bg-black">
        <div className="max-w-6xl mx-auto">
          <VideoPlayer
            videoUrl={replay.videoUrl}
            thumbnailUrl={replay.thumbnailUrl}
            onTimeUpdate={handleTimeUpdate}
            className="w-full"
          />
        </div>
      </div>
      
      {/* Content Section */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title and Creator */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                {replay.creator.avatarUrl ? (
                  <img
                    src={replay.creator.avatarUrl}
                    alt={replay.creator.name}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-white font-bold">
                    {replay.creator.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-medium text-white">{replay.creator.name}</p>
                  {replay.creator.handle && (
                    <a href={`/c/${replay.creator.handle}`} className="text-sm text-slate-400 hover:text-brand-400 transition-colors">
                      @{replay.creator.handle}
                    </a>
                  )}
                </div>
              </div>
              
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {replay.title || 'Untitled Replay'}
              </h1>
              
              {replay.description && (
                <p className="text-slate-400 leading-relaxed">
                  {replay.description}
                </p>
              )}
              
              {/* Stats */}
              <div className="flex items-center gap-4 mt-4 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {replay.viewCount.toLocaleString()} views
                </span>
                {replay.duration && (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatDuration(replay.duration)}
                  </span>
                )}
                {replay.publishedAt && (
                  <span>
                    {new Date(replay.publishedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>
            
            {/* Moments Timeline */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Moments
              </h2>
              <MomentsTimeline
                moments={replay.moments}
                currentTime={currentTime}
              />
            </section>
          </div>
          
          {/* Sidebar - Products */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                Shop Now
              </h2>
              
              {replay.offers.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <p>No active offers</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {replay.offers.flatMap((offer) =>
                    offer.products.map((product) => (
                      <ProductCard
                        key={`${offer.id}-${product.id}`}
                        id={product.id}
                        title={product.title}
                        imageUrl={product.imageUrl}
                        originalPrice={product.originalPrice}
                        offerPrice={product.offerPrice}
                        currency={product.currency}
                        shortLinkUrl={product.shortLinkUrl}
                        badgeText={offer.badgeText}
                        offerName={offer.name}
                        onClick={() => handleProductClick(product, offer)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-slate-500 text-sm">
          <a href="/" className="hover:text-slate-400 transition-colors">
            Powered by Unifyed
          </a>
        </div>
      </footer>
    </main>
  );
}
