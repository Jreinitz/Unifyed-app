/**
 * Unified Chat Types
 * All platform chat messages are normalized to this format
 */

// Supported chat platforms
export type ChatPlatform = 
  | 'tiktok'
  | 'youtube'
  | 'twitch'
  | 'facebook'
  | 'instagram'
  | 'kick'
  | 'restream'; // When source is aggregated via Restream

// Message types
export type ChatMessageType =
  | 'chat'           // Regular chat message
  | 'gift'           // TikTok/YouTube Super Chat/Twitch bits
  | 'subscription'   // New subscriber/member
  | 'follow'         // New follower
  | 'raid'           // Twitch raid
  | 'host'           // Twitch host
  | 'share'          // TikTok share
  | 'like'           // TikTok like
  | 'question'       // TikTok Q&A
  | 'system';        // System messages

// User badge types
export type BadgeType =
  | 'moderator'
  | 'subscriber'
  | 'vip'
  | 'verified'
  | 'creator'
  | 'gift_sender'
  | 'new_viewer';

// Unified chat user
export interface ChatUser {
  id: string;                    // Platform-specific user ID
  username: string;              // Display name
  profileImageUrl?: string | undefined;      // Avatar URL
  badges: BadgeType[];           // User badges
  isModerator: boolean;
  isSubscriber: boolean;
  isVerified: boolean;
}

// Gift/monetary contribution info
export interface ChatGift {
  id: string;
  name: string;
  value: number;                 // Value in cents (USD)
  count: number;                 // Number of gifts
  imageUrl?: string | undefined;
}

// Unified chat message
export interface ChatMessage {
  id: string;                    // Unique message ID
  platform: ChatPlatform;        // Source platform
  type: ChatMessageType;         // Message type
  
  // Content
  content: string;               // Message text
  emotes?: ChatEmote[];          // Emotes in message
  
  // User info
  user: ChatUser;
  
  // Gift info (for gift messages)
  gift?: ChatGift;
  
  // Metadata
  timestamp: Date;
  rawPlatformData?: unknown;     // Original platform data for debugging
  
  // Commerce signals (added by AI analysis)
  signals?: {
    hasBuyingIntent: boolean;
    isQuestion: boolean;
    sentiment: 'positive' | 'neutral' | 'negative';
    suggestedAction?: string | undefined;
  };
}

// Emote in message
export interface ChatEmote {
  id: string;
  code: string;
  imageUrl: string;
  startIndex: number;
  endIndex: number;
}

// Chat connection status
export interface ChatConnectionStatus {
  platform: ChatPlatform;
  connected: boolean;
  viewerCount?: number | undefined;
  error?: string | undefined;
  lastMessageAt?: Date | undefined;
}

// Aggregated chat state
export interface ChatState {
  isLive: boolean;
  connections: ChatConnectionStatus[];
  totalViewers: number;
  messageCount: number;
}

// Chat events for WebSocket
export type ChatEventType =
  | 'message'              // New message
  | 'connection_status'    // Platform connection changed
  | 'viewer_count'         // Viewer count updated
  | 'live_status'          // Live status changed
  | 'commerce_signal';     // AI detected commerce signal

export interface ChatEvent {
  type: ChatEventType;
  payload: ChatMessage | ChatConnectionStatus | ChatState | unknown;
  timestamp: Date;
}

// WebSocket message from server to client
export interface ChatServerMessage {
  event: ChatEventType;
  data: unknown;
}

// WebSocket message from client to server
export interface ChatClientMessage {
  action: 'subscribe' | 'unsubscribe' | 'send_message' | 'pin_product' | 'drop_link';
  payload?: unknown;
}
