'use client';

interface ProductCardProps {
  id: string;
  title: string;
  imageUrl: string | null;
  originalPrice: number;
  offerPrice: number;
  currency: string;
  shortLinkUrl: string;
  badgeText?: string | null;
  offerName?: string;
  onClick?: () => void;
}

function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function ProductCard({
  id,
  title,
  imageUrl,
  originalPrice,
  offerPrice,
  currency,
  shortLinkUrl,
  badgeText,
  offerName,
  onClick,
}: ProductCardProps) {
  const discount = originalPrice > offerPrice 
    ? Math.round((1 - offerPrice / originalPrice) * 100) 
    : 0;

  return (
    <a
      href={shortLinkUrl}
      onClick={onClick}
      className="group block bg-slate-800/50 hover:bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50 hover:border-slate-600 transition-all duration-200 hover:shadow-xl hover:shadow-brand-500/5"
    >
      {/* Image */}
      <div className="relative aspect-square bg-slate-900 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        
        {/* Discount badge */}
        {discount > 0 && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">
            -{discount}%
          </div>
        )}
        
        {/* Offer badge */}
        {badgeText && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-brand-500 text-white text-xs font-bold rounded uppercase">
            {badgeText}
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Offer name */}
        {offerName && (
          <p className="text-xs text-brand-400 font-medium mb-1 truncate">
            {offerName}
          </p>
        )}
        
        {/* Title */}
        <h3 className="font-medium text-white truncate group-hover:text-brand-300 transition-colors">
          {title}
        </h3>
        
        {/* Pricing */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-white">
            {formatPrice(offerPrice, currency)}
          </span>
          {originalPrice > offerPrice && (
            <span className="text-sm text-slate-500 line-through">
              {formatPrice(originalPrice, currency)}
            </span>
          )}
        </div>
        
        {/* CTA */}
        <div className="mt-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-400 group-hover:text-brand-300 transition-colors">
            Buy Now
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}
