'use client';

import type { ChatState, ChatPlatform } from '@unifyed/types';

interface LiveStatsProps {
  chatState: ChatState | null;
  revenue?: number; // Today's revenue in cents
  orders?: number; // Today's orders
  conversionRate?: number; // Percentage
}

const platformColors: Record<ChatPlatform, string> = {
  tiktok: 'bg-pink-500',
  youtube: 'bg-red-500',
  twitch: 'bg-purple-500',
  facebook: 'bg-blue-500',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
  kick: 'bg-green-500',
  restream: 'bg-cyan-500',
};

export function LiveStats({ chatState, revenue = 0, orders = 0, conversionRate = 0 }: LiveStatsProps) {
  const totalViewers = chatState?.totalViewers || 0;
  const isLive = chatState?.isLive || false;

  // Calculate viewer breakdown
  const viewerBreakdown = chatState?.connections
    .filter((c) => c.connected && c.viewerCount && c.viewerCount > 0)
    .map((c) => ({
      platform: c.platform,
      count: c.viewerCount || 0,
      percentage: totalViewers > 0 ? ((c.viewerCount || 0) / totalViewers) * 100 : 0,
    })) || [];

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-4">
      {/* Live status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-500 font-bold text-sm uppercase tracking-wide">Live</span>
            </>
          ) : (
            <>
              <span className="w-3 h-3 bg-gray-600 rounded-full" />
              <span className="text-gray-500 font-bold text-sm uppercase tracking-wide">Offline</span>
            </>
          )}
        </div>
        <span className="text-gray-400 text-sm">{chatState?.messageCount || 0} messages</span>
      </div>

      {/* Total viewers */}
      <div className="text-center py-4 bg-gray-800/50 rounded-lg">
        <div className="text-4xl font-bold text-white">{totalViewers.toLocaleString()}</div>
        <div className="text-gray-400 text-sm mt-1">Total Viewers</div>
      </div>

      {/* Platform breakdown */}
      {viewerBreakdown.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide">By Platform</div>
          
          {/* Stacked bar */}
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
            {viewerBreakdown.map((item) => (
              <div
                key={item.platform}
                className={`${platformColors[item.platform]} h-full transition-all duration-500`}
                style={{ width: `${item.percentage}%` }}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-2">
            {viewerBreakdown.map((item) => (
              <div key={item.platform} className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${platformColors[item.platform]}`} />
                <span className="text-gray-400 capitalize">{item.platform}</span>
                <span className="text-white font-medium">{item.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commerce stats */}
      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-800">
        <div className="text-center">
          <div className="text-xl font-bold text-green-400">
            ${(revenue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-500">Revenue</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-blue-400">{orders}</div>
          <div className="text-xs text-gray-500">Orders</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-yellow-400">{conversionRate.toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Conv. Rate</div>
        </div>
      </div>
    </div>
  );
}
