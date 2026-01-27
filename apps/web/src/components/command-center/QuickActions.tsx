'use client';

import { useState } from 'react';

interface Offer {
  id: string;
  name: string;
  discount: string;
  active: boolean;
}

interface QuickActionsProps {
  offers?: Offer[];
  onPinOffer?: (offerId: string) => void;
  onDropLink?: (offerId: string) => void;
  onFlashSale?: (offerId: string, duration: number) => void;
  isLive?: boolean;
}

export function QuickActions({
  offers = [],
  onPinOffer,
  onDropLink,
  onFlashSale,
  isLive = false,
}: QuickActionsProps) {
  const [flashSaleDuration, setFlashSaleDuration] = useState(5);
  const [showFlashSaleModal, setShowFlashSaleModal] = useState<string | null>(null);

  const handleFlashSale = (offerId: string) => {
    if (onFlashSale) {
      onFlashSale(offerId, flashSaleDuration);
    }
    setShowFlashSaleModal(null);
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-white text-sm">Quick Actions</h3>

      {/* Live offers */}
      {offers.length > 0 ? (
        <div className="space-y-2">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className={`p-3 rounded-lg border ${
                offer.active
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-gray-800 border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white text-sm">{offer.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    offer.active ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {offer.discount}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPinOffer?.(offer.id)}
                  disabled={!isLive}
                  className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  📌 Pin
                </button>
                <button
                  onClick={() => onDropLink?.(offer.id)}
                  disabled={!isLive}
                  className="flex-1 px-2 py-1.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  🔗 Drop Link
                </button>
                <button
                  onClick={() => setShowFlashSaleModal(offer.id)}
                  disabled={!isLive}
                  className="flex-1 px-2 py-1.5 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  ⚡ Flash Sale
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-500 text-sm">
          No active offers. Create one to get started!
        </div>
      )}

      {/* Pre-set messages */}
      <div className="space-y-2 pt-2 border-t border-gray-800">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Quick Messages</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!isLive}
            className="px-3 py-2 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🎉 Welcome new viewers!
          </button>
          <button
            disabled={!isLive}
            className="px-3 py-2 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🛒 Check out our deals!
          </button>
          <button
            disabled={!isLive}
            className="px-3 py-2 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ⏰ Limited time offer!
          </button>
          <button
            disabled={!isLive}
            className="px-3 py-2 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🙏 Thanks for watching!
          </button>
        </div>
      </div>

      {/* Flash Sale Modal */}
      {showFlashSaleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-sm mx-4">
            <h4 className="font-semibold text-white mb-4">Start Flash Sale</h4>
            
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Duration (minutes)</label>
              <div className="flex items-center gap-2">
                {[3, 5, 10, 15].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setFlashSaleDuration(mins)}
                    className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                      flashSaleDuration === mins
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFlashSaleModal(null)}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleFlashSale(showFlashSaleModal)}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
              >
                Start Flash Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
