'use client';

import { useEffect, useState, useCallback } from 'react';

interface OfferProduct {
  id: string;
  title: string;
  imageUrl: string | null;
  originalPrice: number;
  offerPrice: number;
  currency: string;
}

interface Offer {
  id: string;
  name: string;
  description: string | null;
  badgeText: string | null;
  shortLinkCode: string;
  shortLinkUrl: string;
  products: OfferProduct[];
}

interface Creator {
  name: string;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  offers: Offer[];
}

interface CreatorContentProps {
  creator: Creator;
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

// Format price
function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function CreatorContent({ creator, apiUrl }: CreatorContentProps) {
  const [hasTrackedView, setHasTrackedView] = useState(false);

  // Track view on mount
  useEffect(() => {
    if (hasTrackedView) return;
    
    const visitorId = getVisitorId();
    
    fetch(`${apiUrl}/public/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'LINK_IN_BIO_VIEW',
        payload: {
          handle: creator.handle,
          visitorId,
          referrer: document.referrer || null,
        },
      }),
    }).catch((err) => console.error('Failed to track view:', err));
    
    setHasTrackedView(true);
  }, [apiUrl, creator.handle, hasTrackedView]);

  // Handle offer click
  const handleOfferClick = useCallback((offer: Offer) => {
    const visitorId = getVisitorId();
    
    // Track click event (async, don't block navigation)
    fetch(`${apiUrl}/public/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'LINK_IN_BIO_CLICK',
        payload: {
          handle: creator.handle,
          shortLinkId: offer.shortLinkCode,
          visitorId,
        },
      }),
    }).catch((err) => console.error('Failed to track click:', err));
  }, [apiUrl, creator.handle]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/30 to-slate-950 flex flex-col items-center px-4 py-12">
      {/* Profile Header */}
      <div className="text-center mb-10">
        {/* Avatar */}
        <div className="w-28 h-28 rounded-full mx-auto mb-5 ring-4 ring-brand-500/30 ring-offset-4 ring-offset-slate-950 overflow-hidden">
          {creator.avatarUrl ? (
            <img
              src={creator.avatarUrl}
              alt={creator.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-400 via-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-4xl font-bold text-white">
                {creator.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        
        {/* Name */}
        <h1 className="text-2xl font-bold text-white mb-1">
          {creator.name}
        </h1>
        
        {/* Handle */}
        <p className="text-slate-400 text-sm">
          @{creator.handle}
        </p>
        
        {/* Bio */}
        {creator.bio && (
          <p className="text-slate-300 mt-3 max-w-sm mx-auto leading-relaxed">
            {creator.bio}
          </p>
        )}
      </div>
      
      {/* Offers Section */}
      <section className="w-full max-w-md space-y-4">
        {creator.offers.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="text-lg font-medium">No active offers</p>
            <p className="text-sm mt-1">Check back soon for exclusive deals!</p>
          </div>
        ) : (
          creator.offers.map((offer) => {
            // Get the first product for display
            const product = offer.products[0];
            const hasDiscount = product && product.originalPrice > product.offerPrice;
            const discountPercent = hasDiscount 
              ? Math.round((1 - product.offerPrice / product.originalPrice) * 100)
              : 0;
            
            return (
              <a
                key={offer.id}
                href={offer.shortLinkUrl}
                onClick={() => handleOfferClick(offer)}
                className="group block w-full rounded-2xl overflow-hidden bg-gradient-to-r from-slate-800/80 to-slate-800/50 border border-slate-700/50 hover:border-brand-500/50 hover:shadow-xl hover:shadow-brand-500/10 transition-all duration-300"
              >
                {/* Product Image Banner */}
                {product?.imageUrl && (
                  <div className="h-32 overflow-hidden relative">
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                    
                    {/* Discount Badge */}
                    {discountPercent > 0 && (
                      <div className="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">
                        -{discountPercent}%
                      </div>
                    )}
                    
                    {/* Offer Badge */}
                    {offer.badgeText && (
                      <div className="absolute top-3 left-3 px-2 py-1 bg-brand-500 text-white text-xs font-bold rounded uppercase">
                        {offer.badgeText}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Content */}
                <div className="p-5">
                  {/* Offer Name */}
                  <h3 className="font-semibold text-white text-lg group-hover:text-brand-300 transition-colors">
                    {offer.name}
                  </h3>
                  
                  {/* Description */}
                  {offer.description && (
                    <p className="text-slate-400 text-sm mt-1 line-clamp-2">
                      {offer.description}
                    </p>
                  )}
                  
                  {/* Product & Pricing */}
                  {product && (
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-500">{product.title}</p>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-lg font-bold text-white">
                            {formatPrice(product.offerPrice, product.currency)}
                          </span>
                          {hasDiscount && (
                            <span className="text-sm text-slate-500 line-through">
                              {formatPrice(product.originalPrice, product.currency)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* CTA Arrow */}
                      <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center group-hover:bg-brand-400 transition-colors">
                        <svg className="w-5 h-5 text-white group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </a>
            );
          })
        )}
      </section>
      
      {/* Branding Footer */}
      <footer className="mt-16 text-slate-500 text-sm">
        <a href="/" className="flex items-center gap-2 hover:text-slate-400 transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Powered by Unifyed
        </a>
      </footer>
    </main>
  );
}
