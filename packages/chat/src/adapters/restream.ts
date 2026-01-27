import { WebSocket } from 'ws';
import { ChatAdapter, type ChatAdapterConfig } from './base.js';
import type { ChatUser, ChatPlatform, BadgeType } from '@unifyed/types';

/**
 * Restream Chat Adapter
 * Connects to Restream's WebSocket for aggregated chat from ALL platforms
 * This is the preferred path - one connection gets chat from TikTok, YouTube, Twitch, etc.
 */
export class RestreamChatAdapter extends ChatAdapter {
  private ws: WebSocket | undefined = undefined;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private heartbeatInterval: NodeJS.Timeout | undefined = undefined;

  constructor(config: ChatAdapterConfig & { accessToken: string }) {
    super('restream', config);
    if (!config.accessToken) {
      throw new Error('Restream requires accessToken');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        // Restream WebSocket URL with auth
        const wsUrl = `wss://chat.api.restream.io/ws?accessToken=${this.config.accessToken}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log('📡 Restream: WebSocket connected');
          this.startHeartbeat();
          this.onConnected();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          console.log(`📡 Restream: WebSocket closed (${code}): ${reason.toString()}`);
          this.handleDisconnect();
        });

        this.ws.on('error', (error: Error) => {
          this.onError(error);
          reject(error);
        });

        // Timeout
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Restream connection timeout'));
          }
        }, 15000);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.onError(err);
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    this.ws = undefined;
    this.onDisconnected();
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to Restream chat');
    }

    // Send message via Restream chat API
    // Note: This requires Restream's chat relay feature to be enabled
    this.ws.send(JSON.stringify({
      action: 'send_message',
      payload: {
        text: content,
      },
    }));
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw) as RestreamMessage;

      switch (data.action) {
        case 'event':
          if (data.payload && 'type' in data.payload) {
            this.handleEvent(data.payload as RestreamEventPayload);
          }
          break;

        case 'chat_message':
          if (data.payload && ('text' in data.payload || 'message' in data.payload)) {
            this.handleChatMessage(data.payload as RestreamChatPayload);
          }
          break;

        case 'viewer_count':
          if (data.payload && 'count' in data.payload) {
            this.updateViewerCount((data.payload as { count: number }).count || 0);
          }
          break;

        case 'pong':
          // Heartbeat response
          break;

        default:
          // Unknown action, might be platform-specific
          if (data.payload && 'type' in data.payload && (data.payload as RestreamEventPayload).type === 'chat') {
            this.handleChatMessage(data.payload as RestreamChatPayload);
          }
      }
    } catch (error) {
      console.error('Restream message parse error:', error, raw);
    }
  }

  private handleEvent(payload: RestreamEventPayload): void {
    if (!payload) return;

    switch (payload.type) {
      case 'chat':
        this.handleChatMessage(payload);
        break;

      case 'follow':
      case 'follower':
        this.emitFollowMessage(payload);
        break;

      case 'subscription':
      case 'sub':
        this.emitSubscriptionMessage(payload);
        break;

      case 'donation':
      case 'gift':
      case 'superchat':
        this.emitGiftMessage(payload);
        break;

      case 'raid':
        this.emitRaidMessage(payload);
        break;
    }
  }

  private handleChatMessage(payload: RestreamChatPayload): void {
    if (!payload) return;

    const platform = this.mapPlatform(payload.source || payload.platform);
    const user = this.normalizeUser(payload);

    this.emitMessage({
      id: payload.id || `restream-${Date.now()}-${Math.random()}`,
      platform,
      type: 'chat',
      content: payload.text || payload.message || '',
      user,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      rawPlatformData: payload,
    });
  }

  private emitFollowMessage(payload: RestreamEventPayload): void {
    const platform = this.mapPlatform(payload.source || payload.platform);
    
    this.emitMessage({
      id: `restream-follow-${Date.now()}`,
      platform,
      type: 'follow',
      content: 'followed',
      user: this.normalizeUser(payload),
      timestamp: new Date(),
      rawPlatformData: payload,
    });
  }

  private emitSubscriptionMessage(payload: RestreamEventPayload): void {
    const platform = this.mapPlatform(payload.source || payload.platform);
    
    this.emitMessage({
      id: `restream-sub-${Date.now()}`,
      platform,
      type: 'subscription',
      content: payload.message || 'subscribed',
      user: this.normalizeUser(payload),
      timestamp: new Date(),
      rawPlatformData: payload,
    });
  }

  private emitGiftMessage(payload: RestreamEventPayload): void {
    const platform = this.mapPlatform(payload.source || payload.platform);
    
    this.emitMessage({
      id: `restream-gift-${Date.now()}`,
      platform,
      type: 'gift',
      content: payload.message || 'sent a gift',
      user: this.normalizeUser(payload),
      gift: {
        id: payload.giftId || `gift-${Date.now()}`,
        name: payload.giftName || 'Gift',
        value: payload.amount || 0,
        count: payload.count || 1,
        imageUrl: payload.giftImage,
      },
      timestamp: new Date(),
      rawPlatformData: payload,
    });
  }

  private emitRaidMessage(payload: RestreamEventPayload): void {
    const platform = this.mapPlatform(payload.source || payload.platform);
    
    this.emitMessage({
      id: `restream-raid-${Date.now()}`,
      platform,
      type: 'raid',
      content: `raided with ${payload.viewerCount || 0} viewers`,
      user: this.normalizeUser(payload),
      timestamp: new Date(),
      rawPlatformData: payload,
    });
  }

  private normalizeUser(payload: RestreamUserPayload): ChatUser {
    const badges: BadgeType[] = [];

    if (payload.isModerator || payload.badges?.includes('moderator')) {
      badges.push('moderator');
    }
    if (payload.isSubscriber || payload.badges?.includes('subscriber')) {
      badges.push('subscriber');
    }
    if (payload.isOwner || payload.badges?.includes('broadcaster')) {
      badges.push('creator');
    }

    return {
      id: payload.author?.id || payload.userId || payload.username || 'unknown',
      username: payload.author?.displayName || payload.displayName || payload.username || 'Anonymous',
      profileImageUrl: payload.author?.avatar || payload.avatar,
      badges,
      isModerator: payload.isModerator || false,
      isSubscriber: payload.isSubscriber || false,
      isVerified: false,
    };
  }

  private mapPlatform(source?: string): ChatPlatform {
    if (!source) return 'restream';

    const normalized = source.toLowerCase();
    
    if (normalized.includes('youtube')) return 'youtube';
    if (normalized.includes('twitch')) return 'twitch';
    if (normalized.includes('tiktok')) return 'tiktok';
    if (normalized.includes('facebook')) return 'facebook';
    if (normalized.includes('instagram')) return 'instagram';
    if (normalized.includes('kick')) return 'kick';

    return 'restream';
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`📡 Restream: Reconnecting (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect().catch(console.error), 5000 * this.reconnectAttempts);
    } else {
      this.onDisconnected(new Error('Max reconnection attempts reached'));
    }
  }
}

// Restream WebSocket message types
interface RestreamMessage {
  action: string;
  payload?: RestreamEventPayload | RestreamChatPayload | { count: number };
}

interface RestreamEventPayload extends RestreamUserPayload {
  type?: string;
  source?: string;
  platform?: string;
  message?: string;
  text?: string;
  giftId?: string;
  giftName?: string;
  giftImage?: string;
  amount?: number;
  count?: number;
  viewerCount?: number;
}

interface RestreamChatPayload extends RestreamUserPayload {
  id?: string;
  text?: string;
  message?: string;
  source?: string;
  platform?: string;
  timestamp?: string | number;
}

interface RestreamUserPayload {
  author?: {
    id?: string;
    displayName?: string;
    avatar?: string;
  };
  userId?: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  isModerator?: boolean;
  isSubscriber?: boolean;
  isOwner?: boolean;
  badges?: string[];
}
