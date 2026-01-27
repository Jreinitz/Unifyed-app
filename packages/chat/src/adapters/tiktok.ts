import { WebcastPushConnection } from 'tiktok-live-connector';
import { ChatAdapter, type ChatAdapterConfig } from './base.js';
import type { ChatMessage, ChatUser, ChatGift, BadgeType } from '@unifyed/types';

/**
 * TikTok Live Chat Adapter
 * Uses tiktok-live-connector library for real-time chat
 */
export class TikTokChatAdapter extends ChatAdapter {
  private connection: WebcastPushConnection | undefined = undefined;

  constructor(config: ChatAdapterConfig & { username: string }) {
    super('tiktok', config);
    if (!config.username) {
      throw new Error('TikTok username is required');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const username = this.config.username!;
      this.connection = new WebcastPushConnection(username, {
        processInitialData: true,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        fetchRoomInfoOnConnect: true,
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Connect
      const state = await this.connection.connect();
      console.log(`🎵 TikTok: Connected to ${username}'s live (Room ${state.roomId})`);
      this.onConnected();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError(err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.disconnect();
      this.connection = undefined;
    }
    this.onDisconnected();
  }

  async sendMessage(_content: string): Promise<void> {
    // TikTok doesn't support sending messages via API
    throw new Error('TikTok does not support sending messages via API');
  }

  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Chat messages
    this.connection.on('chat', (data: TikTokChatData) => {
      this.emitMessage(this.normalizeChatMessage(data));
    });

    // Gifts
    this.connection.on('gift', (data: TikTokGiftData) => {
      this.emitMessage(this.normalizeGiftMessage(data));
    });

    // New followers
    this.connection.on('social', (data: TikTokSocialData) => {
      if (data.displayType === 'pm_mt_msg_viewer' || data.label?.includes('followed')) {
        this.emitMessage(this.normalizeFollowMessage(data));
      }
    });

    // Shares
    this.connection.on('share', (data: TikTokShareData) => {
      this.emitMessage(this.normalizeShareMessage(data));
    });

    // Likes
    this.connection.on('like', (data: TikTokLikeData) => {
      // Only emit significant like bursts (10+)
      if (data.likeCount >= 10) {
        this.emitMessage(this.normalizeLikeMessage(data));
      }
    });

    // Questions
    this.connection.on('questionNew', (data: TikTokQuestionData) => {
      this.emitMessage(this.normalizeQuestionMessage(data));
    });

    // Room stats (viewer count)
    this.connection.on('roomUser', (data: TikTokRoomUserData) => {
      this.updateViewerCount(data.viewerCount || 0);
    });

    // Live ended
    this.connection.on('streamEnd', () => {
      console.log('🎵 TikTok: Stream ended');
      this.onDisconnected();
    });

    // Disconnected
    this.connection.on('disconnected', () => {
      this.onDisconnected();
    });

    // Errors
    this.connection.on('error', (err: Error) => {
      this.onError(err);
    });
  }

  private normalizeUser(data: TikTokUserData): ChatUser {
    const badges: BadgeType[] = [];
    
    if (data.isModerator) badges.push('moderator');
    if (data.isSubscriber) badges.push('subscriber');
    if (data.isNewGifter || data.topGifterRank) badges.push('gift_sender');

    return {
      id: data.userId || data.uniqueId,
      username: data.nickname || data.uniqueId,
      profileImageUrl: data.profilePictureUrl,
      badges,
      isModerator: data.isModerator || false,
      isSubscriber: data.isSubscriber || false,
      isVerified: data.isVerified || false,
    };
  }

  private normalizeChatMessage(data: TikTokChatData): ChatMessage {
    return {
      id: `tiktok-chat-${data.msgId || Date.now()}`,
      platform: 'tiktok',
      type: 'chat',
      content: data.comment,
      user: this.normalizeUser(data),
      timestamp: new Date(),
      rawPlatformData: data,
    };
  }

  private normalizeGiftMessage(data: TikTokGiftData): ChatMessage {
    const gift: ChatGift = {
      id: String(data.giftId),
      name: data.giftName || 'Gift',
      value: (data.diamondCount || 0) * data.repeatCount,
      count: data.repeatCount || 1,
      imageUrl: data.giftPictureUrl,
    };

    return {
      id: `tiktok-gift-${data.msgId || Date.now()}`,
      platform: 'tiktok',
      type: 'gift',
      content: `sent ${gift.count}x ${gift.name}`,
      user: this.normalizeUser(data),
      gift,
      timestamp: new Date(),
      rawPlatformData: data,
    };
  }

  private normalizeFollowMessage(data: TikTokSocialData): ChatMessage {
    return {
      id: `tiktok-follow-${Date.now()}`,
      platform: 'tiktok',
      type: 'follow',
      content: 'followed',
      user: this.normalizeUser(data),
      timestamp: new Date(),
      rawPlatformData: data,
    };
  }

  private normalizeShareMessage(data: TikTokShareData): ChatMessage {
    return {
      id: `tiktok-share-${Date.now()}`,
      platform: 'tiktok',
      type: 'share',
      content: 'shared the stream',
      user: this.normalizeUser(data),
      timestamp: new Date(),
      rawPlatformData: data,
    };
  }

  private normalizeLikeMessage(data: TikTokLikeData): ChatMessage {
    return {
      id: `tiktok-like-${Date.now()}`,
      platform: 'tiktok',
      type: 'like',
      content: `liked ${data.likeCount} times`,
      user: this.normalizeUser(data),
      timestamp: new Date(),
      rawPlatformData: data,
    };
  }

  private normalizeQuestionMessage(data: TikTokQuestionData): ChatMessage {
    return {
      id: `tiktok-question-${Date.now()}`,
      platform: 'tiktok',
      type: 'question',
      content: data.questionText || '',
      user: this.normalizeUser(data),
      timestamp: new Date(),
      rawPlatformData: data,
    };
  }
}

// TikTok data types (from tiktok-live-connector)
interface TikTokUserData {
  userId?: string;
  uniqueId: string;
  nickname?: string;
  profilePictureUrl?: string;
  isModerator?: boolean;
  isSubscriber?: boolean;
  isVerified?: boolean;
  isNewGifter?: boolean;
  topGifterRank?: number;
}

interface TikTokChatData extends TikTokUserData {
  msgId?: string;
  comment: string;
}

interface TikTokGiftData extends TikTokUserData {
  msgId?: string;
  giftId: number;
  giftName?: string;
  giftPictureUrl?: string;
  diamondCount?: number;
  repeatCount: number;
}

interface TikTokSocialData extends TikTokUserData {
  displayType?: string;
  label?: string;
}

interface TikTokShareData extends TikTokUserData {}

interface TikTokLikeData extends TikTokUserData {
  likeCount: number;
}

interface TikTokQuestionData extends TikTokUserData {
  questionText?: string;
}

interface TikTokRoomUserData {
  viewerCount?: number;
}
