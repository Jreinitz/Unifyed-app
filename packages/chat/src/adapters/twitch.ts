import { WebSocket } from 'ws';
import { ChatAdapter, type ChatAdapterConfig } from './base.js';
import type { ChatUser, BadgeType } from '@unifyed/types';

/**
 * Twitch Chat Adapter
 * - Sends messages via Helix REST API (POST /helix/chat/messages)
 * - Receives messages via EventSub WebSocket (channel.chat.message)
 * - Polls chatters count for viewer info
 */
export class TwitchChatAdapter extends ChatAdapter {
  private pollingInterval: NodeJS.Timeout | undefined = undefined;
  private eventSubWs: WebSocket | undefined = undefined;
  private eventSubSessionId: string | undefined = undefined;
  private keepaliveTimeout: NodeJS.Timeout | undefined = undefined;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly pollIntervalMs = 15000; // 15 seconds for chatters count
  private readonly helixUrl = 'https://api.twitch.tv/helix';
  private userId: string | undefined = undefined;

  constructor(
    config: ChatAdapterConfig & {
      accessToken: string;
      username: string;
      channelId: string; // Twitch login name (for display)
      clientId: string;
      broadcasterId: string; // Numeric Twitch user ID
    }
  ) {
    super('twitch', config);
    if (!config.accessToken || !config.clientId || !config.broadcasterId) {
      throw new Error('Twitch requires accessToken, clientId, and broadcasterId');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Validate the token and get user ID
      const validateResponse = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: {
          Authorization: `OAuth ${this.config.accessToken}`,
        },
      });

      if (!validateResponse.ok) {
        throw new Error(`Twitch token validation failed: ${validateResponse.status}`);
      }

      const validateData = await validateResponse.json() as { user_id: string; login: string };
      this.userId = validateData.user_id;
      console.log(`🎮 Twitch: Authenticated as ${validateData.login} (${validateData.user_id})`);

      // Connect EventSub WebSocket for receiving messages
      await this.connectEventSub();

      // Start polling for chatters count
      this.startPolling();
      this.onConnected();
      console.log(`🎮 Twitch: Connected to chat for #${this.config.channelId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`🎮 Twitch: Connection failed - ${err.message}`);
      this.onError(err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.stopKeepaliveTimer();
    if (this.eventSubWs) {
      this.eventSubWs.close();
      this.eventSubWs = undefined;
    }
    this.eventSubSessionId = undefined;
    this.onDisconnected();
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to Twitch chat');
    }

    const response = await fetch(`${this.helixUrl}/chat/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Client-Id': this.config.clientId!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broadcaster_id: this.config.broadcasterId,
        sender_id: this.config.broadcasterId,
        message: content,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(`Failed to send Twitch message: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json() as { data?: Array<{ is_sent: boolean; drop_reason?: { code: string; message: string } }> };
    const result = data.data?.[0];
    if (result && !result.is_sent) {
      console.warn(`🎮 Twitch: Message not sent - ${result.drop_reason?.message || 'unknown reason'}`);
    }
  }

  // ========================================
  // EventSub WebSocket for receiving messages
  // ========================================

  private connectEventSub(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = 'wss://eventsub.wss.twitch.tv/ws';
        this.eventSubWs = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          if (!this.eventSubSessionId) {
            reject(new Error('EventSub WebSocket connection timeout'));
          }
        }, 15000);

        this.eventSubWs.on('open', () => {
          console.log('🎮 Twitch EventSub: WebSocket opened, waiting for welcome...');
        });

        this.eventSubWs.on('message', async (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString()) as EventSubMessage;
            await this.handleEventSubMessage(msg, resolve, timeout);
          } catch (err) {
            console.error('🎮 Twitch EventSub: Failed to parse message:', err);
          }
        });

        this.eventSubWs.on('close', (code: number) => {
          console.log(`🎮 Twitch EventSub: WebSocket closed (${code})`);
          this.stopKeepaliveTimer();
          this.eventSubSessionId = undefined;
          // Try to reconnect
          if (this.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🎮 Twitch EventSub: Reconnecting (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connectEventSub().catch(console.error), 5000 * this.reconnectAttempts);
          }
        });

        this.eventSubWs.on('error', (error: Error) => {
          console.error('🎮 Twitch EventSub: WebSocket error:', error.message);
          clearTimeout(timeout);
          // Don't reject on error during reconnect, only on initial connect
          if (!this.eventSubSessionId && this.reconnectAttempts === 0) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private async handleEventSubMessage(
    msg: EventSubMessage,
    resolveConnect?: (value: void) => void,
    connectTimeout?: NodeJS.Timeout,
  ): Promise<void> {
    const messageType = msg.metadata?.message_type;

    switch (messageType) {
      case 'session_welcome': {
        const sessionId = msg.payload?.session?.id;
        const keepaliveSeconds = msg.payload?.session?.keepalive_timeout_seconds || 30;
        
        if (!sessionId) {
          console.error('🎮 Twitch EventSub: Welcome message missing session ID');
          return;
        }

        this.eventSubSessionId = sessionId;
        console.log(`🎮 Twitch EventSub: Session ${sessionId}, keepalive ${keepaliveSeconds}s`);

        // Start keepalive timer
        this.resetKeepaliveTimer(keepaliveSeconds);

        // Subscribe to channel.chat.message
        await this.subscribeToChat(sessionId);

        // Resolve the connect promise
        if (connectTimeout) clearTimeout(connectTimeout);
        if (resolveConnect) resolveConnect();
        this.reconnectAttempts = 0;
        break;
      }

      case 'session_keepalive': {
        // Reset keepalive timer
        const keepaliveSeconds = msg.payload?.session?.keepalive_timeout_seconds || 30;
        this.resetKeepaliveTimer(keepaliveSeconds);
        break;
      }

      case 'notification': {
        const subType = msg.metadata?.subscription_type;
        if (subType === 'channel.chat.message') {
          this.handleChatMessage(msg.payload?.event as EventSubChatEvent);
        }
        // Reset keepalive on any notification
        this.resetKeepaliveTimer(30);
        break;
      }

      case 'session_reconnect': {
        const reconnectUrl = msg.payload?.session?.reconnect_url;
        if (reconnectUrl) {
          console.log('🎮 Twitch EventSub: Reconnecting to new URL...');
          // Close current and reconnect to new URL
          if (this.eventSubWs) {
            this.eventSubWs.close();
          }
          // The reconnect URL includes the session, so we just open a new connection
          this.eventSubWs = new WebSocket(reconnectUrl);
          this.eventSubWs.on('message', async (data: WebSocket.Data) => {
            try {
              const reconnMsg = JSON.parse(data.toString()) as EventSubMessage;
              await this.handleEventSubMessage(reconnMsg);
            } catch (err) {
              console.error('🎮 Twitch EventSub: Parse error on reconnect:', err);
            }
          });
        }
        break;
      }

      case 'revocation': {
        console.warn('🎮 Twitch EventSub: Subscription revoked:', msg.payload?.subscription?.status);
        break;
      }
    }
  }

  private async subscribeToChat(sessionId: string): Promise<void> {
    const response = await fetch(`${this.helixUrl}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Client-Id': this.config.clientId!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'channel.chat.message',
        version: '1',
        condition: {
          broadcaster_user_id: this.config.broadcasterId,
          user_id: this.userId || this.config.broadcasterId,
        },
        transport: {
          method: 'websocket',
          session_id: sessionId,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      console.error(`🎮 Twitch EventSub: Failed to subscribe: ${response.status} - ${errorData.message || 'Unknown'}`);
      return;
    }

    console.log('🎮 Twitch EventSub: Subscribed to channel.chat.message');
  }

  private handleChatMessage(event: EventSubChatEvent | undefined): void {
    if (!event) return;

    const user = this.normalizeUser(event);

    this.emitMessage({
      id: event.message_id || `twitch-${Date.now()}`,
      platform: 'twitch',
      type: 'chat',
      content: event.message?.text || '',
      user,
      timestamp: new Date(),
      rawPlatformData: event,
    });
  }

  private normalizeUser(event: EventSubChatEvent): ChatUser {
    const badges: BadgeType[] = [];

    // Parse badges from the event
    if (event.badges) {
      for (const badge of event.badges) {
        if (badge.set_id === 'moderator') badges.push('moderator');
        if (badge.set_id === 'subscriber') badges.push('subscriber');
        if (badge.set_id === 'vip') badges.push('vip');
        if (badge.set_id === 'broadcaster') badges.push('creator');
      }
    }

    return {
      id: event.chatter_user_id || 'unknown',
      username: event.chatter_user_name || event.chatter_user_login || 'unknown',
      profileImageUrl: undefined,
      badges,
      isModerator: badges.includes('moderator'),
      isSubscriber: badges.includes('subscriber'),
      isVerified: false,
    };
  }

  // ========================================
  // Keepalive management
  // ========================================

  private resetKeepaliveTimer(seconds: number): void {
    this.stopKeepaliveTimer();
    // If no message received within timeout + buffer, reconnect
    this.keepaliveTimeout = setTimeout(() => {
      console.warn('🎮 Twitch EventSub: Keepalive timeout, reconnecting...');
      if (this.eventSubWs) {
        this.eventSubWs.close();
      }
    }, (seconds + 10) * 1000);
  }

  private stopKeepaliveTimer(): void {
    if (this.keepaliveTimeout) {
      clearTimeout(this.keepaliveTimeout);
      this.keepaliveTimeout = undefined;
    }
  }

  // ========================================
  // Chatters polling for viewer count
  // ========================================

  private startPolling(): void {
    this.fetchChattersCount().catch(() => {});
    this.pollingInterval = setInterval(async () => {
      try {
        await this.fetchChattersCount();
      } catch {
        // Non-critical
      }
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  private async fetchChattersCount(): Promise<void> {
    const response = await fetch(
      `${this.helixUrl}/chat/chatters?broadcaster_id=${this.config.broadcasterId}&moderator_id=${this.config.broadcasterId}&first=1`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Client-Id': this.config.clientId!,
        },
      }
    );

    if (response.ok) {
      const data = await response.json() as { total?: number };
      if (data.total !== undefined) {
        this.updateViewerCount(data.total);
      }
    }
  }
}

// ========================================
// EventSub WebSocket types
// ========================================

interface EventSubMessage {
  metadata?: {
    message_type?: string;
    subscription_type?: string;
  };
  payload?: {
    session?: {
      id?: string;
      keepalive_timeout_seconds?: number;
      reconnect_url?: string;
    };
    subscription?: {
      status?: string;
    };
    event?: EventSubChatEvent;
  };
}

interface EventSubChatEvent {
  broadcaster_user_id?: string;
  broadcaster_user_login?: string;
  broadcaster_user_name?: string;
  chatter_user_id?: string;
  chatter_user_login?: string;
  chatter_user_name?: string;
  message_id?: string;
  message?: {
    text?: string;
    fragments?: Array<{
      type?: string;
      text?: string;
    }>;
  };
  badges?: Array<{
    set_id: string;
    id: string;
    info: string;
  }>;
  color?: string;
}
