import { EventEmitter } from 'eventemitter3';
import type { 
  ChatMessage, 
  ChatConnectionStatus, 
  ChatState, 
  ChatPlatform 
} from '@unifyed/types';
import { ChatAdapter, type ChatAdapterConfig } from './adapters/base.js';
import { TikTokChatAdapter } from './adapters/tiktok.js';
import { YouTubeChatAdapter } from './adapters/youtube.js';
import { TwitchChatAdapter } from './adapters/twitch.js';
import { RestreamChatAdapter } from './adapters/restream.js';

/**
 * Events emitted by the Chat Aggregator
 */
export interface ChatAggregatorEvents {
  message: (message: ChatMessage) => void;
  connectionChange: (status: ChatConnectionStatus) => void;
  stateChange: (state: ChatState) => void;
  error: (error: Error, platform?: ChatPlatform) => void;
}

/**
 * Configuration for connecting to platforms
 */
export interface PlatformConfig {
  platform: ChatPlatform | 'restream';
  enabled: boolean;
  config: ChatAdapterConfig;
}

/**
 * Chat Aggregator
 * Manages multiple chat platform connections and provides a unified stream of messages
 */
export class ChatAggregator extends EventEmitter<ChatAggregatorEvents> {
  private adapters: Map<string, ChatAdapter> = new Map();
  private messages: ChatMessage[] = [];
  private readonly maxMessageHistory = 1000;
  private useRestream = false;

  constructor(_creatorId: string) {
    super();
  }

  /**
   * Connect to platforms based on configuration
   * If Restream is available, use it as the unified source
   * Otherwise, connect to individual platforms
   */
  async connect(configs: PlatformConfig[]): Promise<void> {
    // Check if Restream is available
    const restreamConfig = configs.find(
      (c) => c.platform === 'restream' && c.enabled
    );

    if (restreamConfig) {
      // Use Restream as the unified source (preferred path)
      this.useRestream = true;
      await this.connectToRestream(restreamConfig.config);
    } else {
      // Connect to individual platforms
      this.useRestream = false;
      const connectPromises = configs
        .filter((c) => c.enabled && c.platform !== 'restream')
        .map((c) => this.connectToPlatform(c.platform as ChatPlatform, c.config));
      
      await Promise.allSettled(connectPromises);
    }

    this.emitState();
  }

  /**
   * Disconnect from all platforms
   */
  async disconnect(): Promise<void> {
    const disconnectPromises = Array.from(this.adapters.values()).map(
      (adapter) => adapter.disconnect()
    );
    await Promise.allSettled(disconnectPromises);
    this.adapters.clear();
    this.emitState();
  }

  /**
   * Connect to a specific platform
   */
  async connectToPlatform(
    platform: ChatPlatform,
    config: ChatAdapterConfig
  ): Promise<void> {
    // If using Restream, don't connect to individual platforms
    if (this.useRestream && platform !== 'restream') {
      console.log(`Skipping ${platform} - using Restream for aggregated chat`);
      return;
    }

    // Create adapter based on platform
    let adapter: ChatAdapter;

    switch (platform) {
      case 'tiktok':
        adapter = new TikTokChatAdapter(config as ChatAdapterConfig & { username: string });
        break;

      case 'youtube':
        adapter = new YouTubeChatAdapter(
          config as ChatAdapterConfig & { accessToken: string; liveChatId?: string | undefined }
        );
        break;

      case 'twitch':
        adapter = new TwitchChatAdapter(
          config as ChatAdapterConfig & {
            accessToken: string;
            username: string;
            channelId: string;
          }
        );
        break;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    this.setupAdapterEvents(adapter);
    
    try {
      await adapter.connect();
      this.adapters.set(platform, adapter);
      console.log(`✅ Connected to ${platform}`);
    } catch (error) {
      console.error(`❌ Failed to connect to ${platform}:`, error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)), platform);
    }
  }

  /**
   * Connect to Restream (unified chat source)
   */
  private async connectToRestream(config: ChatAdapterConfig): Promise<void> {
    const adapter = new RestreamChatAdapter(
      config as ChatAdapterConfig & { accessToken: string }
    );

    this.setupAdapterEvents(adapter);

    try {
      await adapter.connect();
      this.adapters.set('restream', adapter);
      console.log('✅ Connected to Restream (unified chat)');
    } catch (error) {
      console.error('❌ Failed to connect to Restream:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Set up event handlers for an adapter
   */
  private setupAdapterEvents(adapter: ChatAdapter): void {
    adapter.on('message', (message) => {
      this.addMessage(message);
      this.emit('message', message);
    });

    adapter.on('connected', () => {
      this.emit('connectionChange', adapter.getStatus());
      this.emitState();
    });

    adapter.on('disconnected', () => {
      this.emit('connectionChange', adapter.getStatus());
      this.emitState();
    });

    adapter.on('viewerCount', () => {
      this.emitState();
    });

    adapter.on('error', (error) => {
      this.emit('error', error, adapter.platform);
    });
  }

  /**
   * Add a message to history
   */
  private addMessage(message: ChatMessage): void {
    this.messages.push(message);
    
    // Trim history if needed
    if (this.messages.length > this.maxMessageHistory) {
      this.messages = this.messages.slice(-this.maxMessageHistory);
    }
  }

  /**
   * Get current chat state
   */
  getState(): ChatState {
    const connections = Array.from(this.adapters.values()).map(
      (adapter) => adapter.getStatus()
    );

    const totalViewers = connections.reduce(
      (sum, conn) => sum + (conn.viewerCount || 0),
      0
    );

    const isLive = connections.some((conn) => conn.connected);

    return {
      isLive,
      connections,
      totalViewers,
      messageCount: this.messages.length,
    };
  }

  /**
   * Emit state change event
   */
  private emitState(): void {
    this.emit('stateChange', this.getState());
  }

  /**
   * Get message history
   */
  getMessages(limit?: number): ChatMessage[] {
    if (limit) {
      return this.messages.slice(-limit);
    }
    return [...this.messages];
  }

  /**
   * Get messages by platform
   */
  getMessagesByPlatform(platform: ChatPlatform, limit?: number): ChatMessage[] {
    const filtered = this.messages.filter((m) => m.platform === platform);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }

  /**
   * Send a message to all connected platforms that support it
   */
  async sendMessage(content: string, platforms?: ChatPlatform[]): Promise<void> {
    const targetAdapters = platforms
      ? Array.from(this.adapters.entries())
          .filter(([key]) => platforms.includes(key as ChatPlatform))
          .map(([, adapter]) => adapter)
      : Array.from(this.adapters.values());

    const results = await Promise.allSettled(
      targetAdapters.map((adapter) => adapter.sendMessage(content))
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `Failed to send message to ${targetAdapters[index]?.platform}:`,
          result.reason
        );
      }
    });
  }

  /**
   * Get connection status for a specific platform
   */
  getConnectionStatus(platform: ChatPlatform): ChatConnectionStatus | undefined {
    return this.adapters.get(platform)?.getStatus();
  }

  /**
   * Check if using Restream for aggregated chat
   */
  isUsingRestream(): boolean {
    return this.useRestream;
  }

  /**
   * Get total viewer count across all platforms
   */
  getTotalViewers(): number {
    return Array.from(this.adapters.values()).reduce(
      (sum, adapter) => sum + adapter.getViewerCount(),
      0
    );
  }
}

/**
 * Create a chat aggregator for a creator
 */
export function createChatAggregator(creatorId: string): ChatAggregator {
  return new ChatAggregator(creatorId);
}
