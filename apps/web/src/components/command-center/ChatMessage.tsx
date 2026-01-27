'use client';

import type { ChatMessage as ChatMessageType, ChatPlatform, BadgeType } from '@unifyed/types';

// Simple relative time formatter
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Platform colors and icons
const platformConfig: Record<ChatPlatform, { color: string; bgColor: string; icon: string }> = {
  tiktok: { color: 'text-pink-400', bgColor: 'bg-pink-500/10', icon: '♪' },
  youtube: { color: 'text-red-500', bgColor: 'bg-red-500/10', icon: '▶' },
  twitch: { color: 'text-purple-400', bgColor: 'bg-purple-500/10', icon: '◆' },
  facebook: { color: 'text-blue-500', bgColor: 'bg-blue-500/10', icon: 'f' },
  instagram: { color: 'text-pink-500', bgColor: 'bg-pink-500/10', icon: '◎' },
  kick: { color: 'text-green-400', bgColor: 'bg-green-500/10', icon: 'K' },
  restream: { color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', icon: '◇' },
};

// Badge icons
const badgeIcons: Record<BadgeType, string> = {
  moderator: '🛡️',
  subscriber: '⭐',
  vip: '💎',
  verified: '✓',
  creator: '👑',
  gift_sender: '🎁',
  new_viewer: '🆕',
};

interface ChatMessageProps {
  message: ChatMessageType;
  onHighlight?: (message: ChatMessageType) => void;
  onPin?: (message: ChatMessageType) => void;
}

export function ChatMessage({ message, onHighlight, onPin }: ChatMessageProps) {
  const platform = platformConfig[message.platform] || platformConfig.restream;
  const isGift = message.type === 'gift';
  const isSpecial = ['subscription', 'raid', 'follow'].includes(message.type);

  return (
    <div
      className={`group flex items-start gap-2 px-3 py-2 hover:bg-gray-800/50 transition-colors ${
        isGift ? 'bg-yellow-500/10 border-l-2 border-yellow-500' : ''
      } ${isSpecial ? 'bg-blue-500/5 border-l-2 border-blue-500' : ''}`}
    >
      {/* Platform badge */}
      <div
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${platform.bgColor} ${platform.color}`}
      >
        {platform.icon}
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        {/* User info */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Avatar */}
          {message.user.profileImageUrl && (
            <img
              src={message.user.profileImageUrl}
              alt={message.user.username}
              className="w-5 h-5 rounded-full"
            />
          )}
          
          {/* Username */}
          <span className={`font-semibold text-sm ${platform.color}`}>
            {message.user.username}
          </span>
          
          {/* Badges */}
          {message.user.badges.map((badge) => (
            <span key={badge} className="text-xs" title={badge}>
              {badgeIcons[badge]}
            </span>
          ))}
          
          {/* Timestamp */}
          <span className="text-xs text-gray-500">
            {formatRelativeTime(new Date(message.timestamp))}
          </span>
        </div>

        {/* Message text */}
        <div className="text-gray-200 text-sm mt-0.5 break-words">
          {isGift && message.gift && (
            <span className="text-yellow-400 font-medium mr-1">
              🎁 {message.gift.count}x {message.gift.name} (${(message.gift.value / 100).toFixed(2)})
            </span>
          )}
          {isSpecial && (
            <span className="text-blue-400 font-medium mr-1">
              {message.type === 'subscription' && '⭐ New subscriber:'}
              {message.type === 'follow' && '👋 New follower:'}
              {message.type === 'raid' && '🚀 Raid:'}
            </span>
          )}
          {message.content}
        </div>

        {/* Commerce signals indicator */}
        {message.signals?.hasBuyingIntent && (
          <div className="mt-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded inline-flex items-center gap-1">
            <span>💰</span>
            <span>Buying intent detected</span>
          </div>
        )}
      </div>

      {/* Action buttons (visible on hover) */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {onHighlight && (
          <button
            onClick={() => onHighlight(message)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-yellow-400"
            title="Highlight"
          >
            ⭐
          </button>
        )}
        {onPin && (
          <button
            onClick={() => onPin(message)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-blue-400"
            title="Pin product"
          >
            📌
          </button>
        )}
      </div>
    </div>
  );
}
