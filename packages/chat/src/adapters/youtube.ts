import { ChatAdapter, type ChatAdapterConfig } from './base.js';
import type { ChatMessage, ChatUser, BadgeType } from '@unifyed/types';

/**
 * YouTube Live Chat Adapter
 * Uses YouTube Data API for live chat messages
 */
export class YouTubeChatAdapter extends ChatAdapter {
  private liveChatId: string | undefined;
  private pollingInterval: NodeJS.Timeout | undefined = undefined;
  private nextPageToken: string | undefined = undefined;
  private readonly pollIntervalMs = 5000; // 5 seconds

  constructor(config: ChatAdapterConfig & { accessToken: string; liveChatId?: string | undefined }) {
    super('youtube', config);
    this.liveChatId = config.liveChatId ?? undefined;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // If no liveChatId provided, try to find active broadcast
      if (!this.liveChatId) {
        this.liveChatId = await this.findActiveLiveChatId();
      }

      if (!this.liveChatId) {
        throw new Error('No active YouTube live chat found');
      }

      // Start polling for messages
      this.startPolling();
      this.onConnected();
      console.log('▶️ YouTube: Connected to live chat');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError(err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.onDisconnected();
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.liveChatId) {
      throw new Error('Not connected to live chat');
    }

    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            liveChatId: this.liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
              messageText: content,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as { error?: { message?: string; errors?: Array<{ reason?: string; domain?: string }> } };
      const reason = errorBody.error?.errors?.[0]?.reason || errorBody.error?.message || 'Unknown';
      console.error(`▶️ YouTube send error ${response.status}: ${reason}`, JSON.stringify(errorBody.error || {}));
      throw new Error(`Failed to send YouTube message: ${response.status} - ${reason}`);
    }
  }

  private async findActiveLiveChatId(): Promise<string | undefined> {
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=active&broadcastType=all',
      {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch YouTube broadcasts');
    }

    const data = await response.json() as YouTubeBroadcastsResponse;
    const activeBroadcast = data.items?.[0];

    if (activeBroadcast?.snippet?.liveChatId) {
      return activeBroadcast.snippet.liveChatId;
    }

    return undefined;
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      try {
        await this.fetchMessages();
      } catch (error) {
        console.error('YouTube chat polling error:', error);
      }
    }, this.pollIntervalMs);

    // Fetch immediately
    this.fetchMessages().catch(console.error);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  private async fetchMessages(): Promise<void> {
    if (!this.liveChatId) return;

    const params = new URLSearchParams({
      liveChatId: this.liveChatId,
      part: 'snippet,authorDetails',
      maxResults: '200',
    });

    if (this.nextPageToken) {
      params.set('pageToken', this.nextPageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/liveChat/messages?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        // Chat ended or access revoked
        this.onDisconnected(new Error('Live chat access denied'));
        return;
      }
      throw new Error(`Failed to fetch YouTube messages: ${response.status}`);
    }

    const data = await response.json() as YouTubeChatResponse;
    
    // Update next page token
    this.nextPageToken = data.nextPageToken;

    // Process messages
    for (const item of data.items || []) {
      const message = this.normalizeMessage(item);
      if (message) {
        this.emitMessage(message);
      }
    }
  }

  private normalizeMessage(item: YouTubeChatItem): ChatMessage | null {
    const snippet = item.snippet;
    const author = item.authorDetails;

    if (!snippet || !author) return null;

    const user = this.normalizeUser(author);
    const type = snippet.type;

    // Handle different message types
    switch (type) {
      case 'textMessageEvent':
        return {
          id: item.id,
          platform: 'youtube',
          type: 'chat',
          content: snippet.textMessageDetails?.messageText || '',
          user,
          timestamp: new Date(snippet.publishedAt),
          rawPlatformData: item,
        };

      case 'superChatEvent':
        const superChat = snippet.superChatDetails;
        return {
          id: item.id,
          platform: 'youtube',
          type: 'gift',
          content: superChat?.userComment || 'Super Chat',
          user,
          gift: {
            id: item.id,
            name: 'Super Chat',
            value: superChat?.amountMicros ? Math.round(superChat.amountMicros / 10000) : 0,
            count: 1,
          },
          timestamp: new Date(snippet.publishedAt),
          rawPlatformData: item,
        };

      case 'superStickerEvent':
        const superSticker = snippet.superStickerDetails;
        return {
          id: item.id,
          platform: 'youtube',
          type: 'gift',
          content: 'Super Sticker',
          user,
          gift: {
            id: item.id,
            name: superSticker?.superStickerMetadata?.altText || 'Super Sticker',
            value: superSticker?.amountMicros ? Math.round(superSticker.amountMicros / 10000) : 0,
            count: 1,
            imageUrl: superSticker?.superStickerMetadata?.imageUrl,
          },
          timestamp: new Date(snippet.publishedAt),
          rawPlatformData: item,
        };

      case 'memberMilestoneChatEvent':
      case 'newSponsorEvent':
        return {
          id: item.id,
          platform: 'youtube',
          type: 'subscription',
          content: snippet.memberMilestoneChatDetails?.userComment || 'became a member',
          user,
          timestamp: new Date(snippet.publishedAt),
          rawPlatformData: item,
        };

      default:
        return null;
    }
  }

  private normalizeUser(author: YouTubeAuthorDetails): ChatUser {
    const badges: BadgeType[] = [];

    if (author.isChatModerator) badges.push('moderator');
    if (author.isChatSponsor) badges.push('subscriber');
    if (author.isVerified) badges.push('verified');
    if (author.isChatOwner) badges.push('creator');

    return {
      id: author.channelId,
      username: author.displayName,
      profileImageUrl: author.profileImageUrl,
      badges,
      isModerator: author.isChatModerator || false,
      isSubscriber: author.isChatSponsor || false,
      isVerified: author.isVerified || false,
    };
  }
}

// YouTube API types
interface YouTubeBroadcastsResponse {
  items?: Array<{
    snippet?: {
      liveChatId?: string;
    };
  }>;
}

interface YouTubeChatResponse {
  nextPageToken?: string;
  items?: YouTubeChatItem[];
}

interface YouTubeChatItem {
  id: string;
  snippet?: {
    type: string;
    publishedAt: string;
    textMessageDetails?: {
      messageText?: string;
    };
    superChatDetails?: {
      amountMicros?: number;
      userComment?: string;
    };
    superStickerDetails?: {
      amountMicros?: number;
      superStickerMetadata?: {
        altText?: string;
        imageUrl?: string;
      };
    };
    memberMilestoneChatDetails?: {
      userComment?: string;
    };
  };
  authorDetails?: YouTubeAuthorDetails;
}

interface YouTubeAuthorDetails {
  channelId: string;
  displayName: string;
  profileImageUrl?: string;
  isChatModerator?: boolean;
  isChatSponsor?: boolean;
  isVerified?: boolean;
  isChatOwner?: boolean;
}
