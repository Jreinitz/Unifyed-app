import { WebSocket } from 'ws';
import { ChatAdapter, type ChatAdapterConfig } from './base.js';
import type { ChatUser, BadgeType } from '@unifyed/types';

/**
 * Twitch Chat Adapter
 * Uses Twitch IRC over WebSocket for real-time chat
 */
export class TwitchChatAdapter extends ChatAdapter {
  private ws: WebSocket | undefined = undefined;
  private readonly ircUrl = 'wss://irc-ws.chat.twitch.tv:443';
  private pingInterval: NodeJS.Timeout | undefined = undefined;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  constructor(
    config: ChatAdapterConfig & {
      accessToken: string;
      username: string;
      channelId: string;
    }
  ) {
    super('twitch', config);
    if (!config.accessToken || !config.username || !config.channelId) {
      throw new Error('Twitch requires accessToken, username, and channelId');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.ircUrl);

        this.ws.on('open', () => {
          this.authenticate();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          this.handleDisconnect();
        });

        this.ws.on('error', (error: Error) => {
          this.onError(error);
          reject(error);
        });

        // Set timeout for connection
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Twitch connection timeout'));
          }
        }, 10000);

        // Listen for successful auth
        const onConnected = () => {
          this.off('connected', onConnected);
          resolve();
        };
        this.on('connected', onConnected);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.onError(err);
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
    }
    this.ws = undefined;
    this.onDisconnected();
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to Twitch chat');
    }

    const channel = this.config.channelId!.toLowerCase();
    this.ws.send(`PRIVMSG #${channel} :${content}`);
  }

  private authenticate(): void {
    if (!this.ws) return;

    // Request capabilities
    this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
    
    // Authenticate
    this.ws.send(`PASS oauth:${this.config.accessToken}`);
    this.ws.send(`NICK ${this.config.username!.toLowerCase()}`);
    
    // Join channel
    const channel = this.config.channelId!.toLowerCase();
    this.ws.send(`JOIN #${channel}`);
  }

  private handleMessage(raw: string): void {
    const lines = raw.split('\r\n').filter((line) => line.length > 0);

    for (const line of lines) {
      // Handle PING
      if (line.startsWith('PING')) {
        this.ws?.send('PONG :tmi.twitch.tv');
        continue;
      }

      // Parse IRC message
      const parsed = this.parseIrcMessage(line);
      if (!parsed) continue;

      switch (parsed.command) {
        case '001': // Successful auth
          console.log('🎮 Twitch: Authenticated');
          break;

        case 'JOIN':
          console.log(`🎮 Twitch: Joined #${this.config.channelId}`);
          this.onConnected();
          this.startPingInterval();
          break;

        case 'PRIVMSG':
          this.handleChatMessage(parsed);
          break;

        case 'USERNOTICE':
          this.handleUserNotice(parsed);
          break;

        case 'CLEARCHAT':
        case 'CLEARMSG':
          // Message deleted - ignore for now
          break;

        case 'ROOMSTATE':
          // Room state update - could use for viewer count
          break;

        case 'NOTICE':
          // Server notice
          if (parsed.message?.includes('Login authentication failed')) {
            this.onError(new Error('Twitch authentication failed'));
          }
          break;
      }
    }
  }

  private handleChatMessage(parsed: ParsedIrcMessage): void {
    const user = this.parseUser(parsed);
    const bits = parsed.tags?.['bits'];

    if (bits) {
      // Cheer message (bits)
      this.emitMessage({
        id: parsed.tags?.['id'] || `twitch-${Date.now()}`,
        platform: 'twitch',
        type: 'gift',
        content: parsed.message || '',
        user,
        gift: {
          id: `bits-${Date.now()}`,
          name: 'Bits',
          value: parseInt(bits, 10), // Bits are roughly 1 cent each
          count: parseInt(bits, 10),
        },
        timestamp: new Date(parseInt(parsed.tags?.['tmi-sent-ts'] || '0', 10) || Date.now()),
        rawPlatformData: parsed,
      });
    } else {
      // Regular chat message
      this.emitMessage({
        id: parsed.tags?.['id'] || `twitch-${Date.now()}`,
        platform: 'twitch',
        type: 'chat',
        content: parsed.message || '',
        user,
        timestamp: new Date(parseInt(parsed.tags?.['tmi-sent-ts'] || '0', 10) || Date.now()),
        rawPlatformData: parsed,
      });
    }
  }

  private handleUserNotice(parsed: ParsedIrcMessage): void {
    const user = this.parseUser(parsed);
    const msgId = parsed.tags?.['msg-id'];

    switch (msgId) {
      case 'sub':
      case 'resub':
      case 'subgift':
      case 'submysterygift':
        this.emitMessage({
          id: parsed.tags?.['id'] || `twitch-sub-${Date.now()}`,
          platform: 'twitch',
          type: 'subscription',
          content: parsed.tags?.['system-msg'] || parsed.message || 'subscribed',
          user,
          timestamp: new Date(),
          rawPlatformData: parsed,
        });
        break;

      case 'raid':
        const viewerCount = parseInt(parsed.tags?.['msg-param-viewerCount'] || '0', 10);
        this.emitMessage({
          id: parsed.tags?.['id'] || `twitch-raid-${Date.now()}`,
          platform: 'twitch',
          type: 'raid',
          content: `raided with ${viewerCount} viewers`,
          user,
          timestamp: new Date(),
          rawPlatformData: parsed,
        });
        break;
    }
  }

  private parseUser(parsed: ParsedIrcMessage): ChatUser {
    const tags = parsed.tags || {};
    const badges: BadgeType[] = [];

    // Parse badges
    const badgeStr = tags['badges'] || '';
    if (badgeStr.includes('moderator')) badges.push('moderator');
    if (badgeStr.includes('subscriber')) badges.push('subscriber');
    if (badgeStr.includes('vip')) badges.push('vip');
    if (badgeStr.includes('broadcaster')) badges.push('creator');

    return {
      id: tags['user-id'] || parsed.prefix?.split('!')[0] || 'unknown',
      username: tags['display-name'] || parsed.prefix?.split('!')[0] || 'unknown',
      profileImageUrl: undefined, // Would need separate API call
      badges,
      isModerator: badgeStr.includes('moderator') || badgeStr.includes('broadcaster'),
      isSubscriber: badgeStr.includes('subscriber'),
      isVerified: badgeStr.includes('partner'),
    };
  }

  private parseIrcMessage(raw: string): ParsedIrcMessage | null {
    const parsed: ParsedIrcMessage = {};

    // Parse tags
    if (raw.startsWith('@')) {
      const tagEnd = raw.indexOf(' ');
      const tagStr = raw.substring(1, tagEnd);
      parsed.tags = {};
      
      for (const tag of tagStr.split(';')) {
        const [key, value] = tag.split('=');
        if (key) {
          parsed.tags[key] = value || '';
        }
      }
      
      raw = raw.substring(tagEnd + 1);
    }

    // Parse prefix
    if (raw.startsWith(':')) {
      const prefixEnd = raw.indexOf(' ');
      parsed.prefix = raw.substring(1, prefixEnd);
      raw = raw.substring(prefixEnd + 1);
    }

    // Parse command
    const commandEnd = raw.indexOf(' ');
    if (commandEnd === -1) {
      parsed.command = raw;
      return parsed;
    }

    parsed.command = raw.substring(0, commandEnd);
    raw = raw.substring(commandEnd + 1);

    // Parse params and message
    if (raw.includes(' :')) {
      const msgStart = raw.indexOf(' :');
      parsed.params = raw.substring(0, msgStart);
      parsed.message = raw.substring(msgStart + 2);
    } else if (raw.startsWith(':')) {
      parsed.message = raw.substring(1);
    } else {
      parsed.params = raw;
    }

    return parsed;
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send('PING :tmi.twitch.tv');
      }
    }, 60000); // Ping every minute
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  private handleDisconnect(): void {
    this.stopPingInterval();
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🎮 Twitch: Reconnecting (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect().catch(console.error), 5000);
    } else {
      this.onDisconnected(new Error('Max reconnection attempts reached'));
    }
  }
}

interface ParsedIrcMessage {
  tags?: Record<string, string>;
  prefix?: string;
  command?: string;
  params?: string;
  message?: string;
}
