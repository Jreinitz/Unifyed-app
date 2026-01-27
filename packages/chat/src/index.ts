// Adapters
export * from './adapters/index.js';

// Aggregator
export { 
  ChatAggregator, 
  createChatAggregator,
  type ChatAggregatorEvents,
  type PlatformConfig 
} from './aggregator.js';

// Re-export types
export type {
  ChatMessage,
  ChatUser,
  ChatGift,
  ChatEmote,
  ChatPlatform,
  ChatMessageType,
  ChatConnectionStatus,
  ChatState,
  ChatEvent,
  ChatEventType,
  BadgeType,
} from '@unifyed/types';
