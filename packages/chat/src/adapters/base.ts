import { EventEmitter } from 'eventemitter3';
import type { ChatMessage, ChatPlatform, ChatConnectionStatus } from '@unifyed/types';

/**
 * Events emitted by chat adapters
 */
export interface ChatAdapterEvents {
  message: (message: ChatMessage) => void;
  connected: () => void;
  disconnected: (error?: Error) => void;
  viewerCount: (count: number) => void;
  error: (error: Error) => void;
}

/**
 * Configuration for chat adapters
 */
export interface ChatAdapterConfig {
  creatorId: string;
  // Platform-specific config
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  username?: string | undefined;
  channelId?: string | undefined;
  liveChatId?: string | undefined;
  clientId?: string | undefined;
  broadcasterId?: string | undefined;
}

/**
 * Base class for all chat platform adapters
 */
export abstract class ChatAdapter extends EventEmitter<ChatAdapterEvents> {
  protected connected: boolean = false;
  protected viewerCount: number = 0;
  protected lastMessageAt: Date | undefined = undefined;
  protected lastError: string | undefined = undefined;

  constructor(
    public readonly platform: ChatPlatform,
    protected config: ChatAdapterConfig
  ) {
    super();
  }

  /**
   * Connect to the chat platform
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the chat platform
   */
  abstract disconnect(): Promise<void>;

  /**
   * Send a message to the chat (if supported)
   */
  abstract sendMessage(content: string): Promise<void>;

  /**
   * Check if the adapter is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get current viewer count
   */
  getViewerCount(): number {
    return this.viewerCount;
  }

  /**
   * Get connection status
   */
  getStatus(): ChatConnectionStatus {
    return {
      platform: this.platform,
      connected: this.connected,
      viewerCount: this.viewerCount,
      error: this.lastError,
      lastMessageAt: this.lastMessageAt,
    };
  }

  /**
   * Update viewer count and emit event
   */
  protected updateViewerCount(count: number): void {
    this.viewerCount = count;
    this.emit('viewerCount', count);
  }

  /**
   * Emit a normalized chat message
   */
  protected emitMessage(message: ChatMessage): void {
    this.lastMessageAt = new Date();
    this.emit('message', message);
  }

  /**
   * Handle connection established
   */
  protected onConnected(): void {
    this.connected = true;
    this.lastError = undefined;
    this.emit('connected');
  }

  /**
   * Handle disconnection
   */
  protected onDisconnected(error?: Error): void {
    this.connected = false;
    if (error) {
      this.lastError = error.message;
    }
    this.emit('disconnected', error);
  }

  /**
   * Handle errors
   */
  protected onError(error: Error): void {
    this.lastError = error.message;
    this.emit('error', error);
  }
}
