import { ChatAggregator, createChatAggregator, type PlatformConfig } from '@unifyed/chat';
import type { ChatMessage, ChatConnectionStatus, ChatState, ChatPlatform } from '@unifyed/types';
import type { Database } from '@unifyed/db';
import { eq, and } from 'drizzle-orm';
import { platformConnections } from '@unifyed/db/schema';
import { decrypt } from '@unifyed/utils';
import { processMessage } from './ai-chat.service.js';

/**
 * Chat Service
 * Manages chat aggregators for each creator and provides unified chat access
 */
export class ChatService {
  private aggregators: Map<string, ChatAggregator> = new Map();
  private messageCallbacks: Map<string, Set<(message: ChatMessage) => void>> = new Map();
  private stateCallbacks: Map<string, Set<(state: ChatState) => void>> = new Map();

  constructor(private db: Database, private encryptionKey: string) {}

  /**
   * Get or create a chat aggregator for a creator
   */
  getAggregator(creatorId: string): ChatAggregator | undefined {
    return this.aggregators.get(creatorId);
  }

  /**
   * Start chat aggregation for a creator
   * Automatically detects available connections (Restream or direct platforms)
   */
  async startChat(creatorId: string): Promise<ChatAggregator> {
    // Check if already running
    const existing = this.aggregators.get(creatorId);
    if (existing) {
      return existing;
    }

    // Get connection configs
    const configs = await this.getConnectionConfigs(creatorId);
    
    if (configs.length === 0) {
      console.warn(`💬 No chat connections available for creator ${creatorId}`);
      throw new Error('No chat connections available. Connect a streaming platform or Restream first.');
    }

    console.log(`💬 Starting chat with ${configs.length} connection(s): ${configs.map(c => c.platform).join(', ')}`);

    // Create aggregator
    const aggregator = createChatAggregator(creatorId);
    
    // Set up event forwarding with AI enrichment
    aggregator.on('message', (message) => {
      // Enrich message with AI signals
      const enrichedMessage = processMessage(message);
      
      const callbacks = this.messageCallbacks.get(creatorId);
      if (callbacks) {
        callbacks.forEach((cb) => cb(enrichedMessage));
      }
    });

    aggregator.on('stateChange', (state) => {
      const callbacks = this.stateCallbacks.get(creatorId);
      if (callbacks) {
        callbacks.forEach((cb) => cb(state));
      }
    });

    aggregator.on('error', (error, platform) => {
      console.error(`💬 Chat error for creator ${creatorId}${platform ? ` on ${platform}` : ''}:`, error.message);
    });

    // Connect to platforms - don't throw if connection fails
    // The aggregator will still be usable, just without chat messages
    try {
      await aggregator.connect(configs);
      console.log(`💬 Chat aggregation connected for creator ${creatorId}`);
    } catch (connectError) {
      console.error(`💬 Chat platform connection failed (non-fatal):`, connectError instanceof Error ? connectError.message : connectError);
      // Still register the aggregator - it can retry or the WS stats still work
    }
    
    this.aggregators.set(creatorId, aggregator);
    console.log(`💬 Started chat aggregation for creator ${creatorId}`);
    
    return aggregator;
  }

  /**
   * Stop chat aggregation for a creator
   */
  async stopChat(creatorId: string): Promise<void> {
    const aggregator = this.aggregators.get(creatorId);
    if (aggregator) {
      await aggregator.disconnect();
      this.aggregators.delete(creatorId);
      console.log(`💬 Stopped chat aggregation for creator ${creatorId}`);
    }
  }

  /**
   * Subscribe to chat messages for a creator
   */
  onMessage(creatorId: string, callback: (message: ChatMessage) => void): () => void {
    if (!this.messageCallbacks.has(creatorId)) {
      this.messageCallbacks.set(creatorId, new Set());
    }
    this.messageCallbacks.get(creatorId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.messageCallbacks.get(creatorId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.messageCallbacks.delete(creatorId);
        }
      }
    };
  }

  /**
   * Subscribe to chat state changes for a creator
   */
  onStateChange(creatorId: string, callback: (state: ChatState) => void): () => void {
    if (!this.stateCallbacks.has(creatorId)) {
      this.stateCallbacks.set(creatorId, new Set());
    }
    this.stateCallbacks.get(creatorId)!.add(callback);

    return () => {
      const callbacks = this.stateCallbacks.get(creatorId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.stateCallbacks.delete(creatorId);
        }
      }
    };
  }

  /**
   * Get current chat state for a creator
   */
  getChatState(creatorId: string): ChatState | null {
    const aggregator = this.aggregators.get(creatorId);
    if (!aggregator) return null;
    return aggregator.getState();
  }

  /**
   * Get recent messages for a creator
   */
  getMessages(creatorId: string, limit = 100): ChatMessage[] {
    const aggregator = this.aggregators.get(creatorId);
    if (!aggregator) return [];
    return aggregator.getMessages(limit);
  }

  /**
   * Send a message to chat (if supported)
   */
  async sendMessage(creatorId: string, content: string, platforms?: ChatPlatform[]): Promise<void> {
    const aggregator = this.aggregators.get(creatorId);
    if (!aggregator) {
      throw new Error('Chat not active');
    }
    await aggregator.sendMessage(content, platforms);
  }

  /**
   * Get connection configs for a creator from the database
   */
  private async getConnectionConfigs(creatorId: string): Promise<PlatformConfig[]> {
    const configs: PlatformConfig[] = [];

    // Check for Restream connection (preferred)
    const restreamConn = await this.db.query.streamingToolConnections.findFirst({
      where: (t: any, { eq: whereEq, and: whereAnd }: any) => whereAnd(
        whereEq(t.creatorId, creatorId),
        whereEq(t.tool, 'restream'),
        whereEq(t.status, 'connected')
      ),
    });

    if (restreamConn) {
      // Decrypt credentials using AES-256-GCM
      let credentials: { accessToken: string };
      try {
        const decrypted = decrypt(restreamConn.credentials, this.encryptionKey);
        credentials = JSON.parse(decrypted);
      } catch (err) {
        console.error('Failed to decrypt Restream credentials:', err);
        // Skip this connection if decryption fails
        return configs;
      }

      configs.push({
        platform: 'restream',
        enabled: true,
        config: {
          creatorId,
          accessToken: credentials.accessToken,
        },
      });

      // If Restream is available, we don't need direct platform connections
      return configs;
    }

    // Get direct platform connections
    const platformConns = await this.db
      .select()
      .from(platformConnections)
      .where(and(
        eq(platformConnections.creatorId, creatorId),
        eq(platformConnections.status, 'healthy')
      ));

    for (const conn of platformConns) {
      // Only add streaming platforms
      if (!['youtube', 'twitch', 'tiktok'].includes(conn.platform)) {
        continue;
      }

      // Decrypt credentials using AES-256-GCM
      let credentials: { accessToken?: string; username?: string };
      try {
        const decrypted = decrypt(conn.credentials || '', this.encryptionKey);
        credentials = JSON.parse(decrypted);
      } catch {
        console.error(`Failed to decrypt ${conn.platform} credentials, skipping`);
        continue;
      }

      const platform = conn.platform as ChatPlatform;

      switch (platform) {
        case 'tiktok':
          // TikTok needs username, not access token for chat
          if (conn.displayName) {
            configs.push({
              platform: 'tiktok',
              enabled: true,
              config: {
                creatorId,
                username: conn.displayName,
              },
            });
          }
          break;

        case 'youtube':
          if (credentials.accessToken) {
            configs.push({
              platform: 'youtube',
              enabled: true,
              config: {
                creatorId,
                accessToken: credentials.accessToken,
              },
            });
          }
          break;

        case 'twitch':
          if (credentials.accessToken && credentials.username && conn.externalId) {
            configs.push({
              platform: 'twitch',
              enabled: true,
              config: {
                creatorId,
                accessToken: credentials.accessToken,
                username: credentials.username,
                channelId: conn.externalId,
              },
            });
          }
          break;
      }
    }

    return configs;
  }

  /**
   * Check if chat is active for a creator
   */
  isActive(creatorId: string): boolean {
    return this.aggregators.has(creatorId);
  }

  /**
   * Get connection status for all platforms
   */
  getConnectionStatuses(creatorId: string): ChatConnectionStatus[] {
    const aggregator = this.aggregators.get(creatorId);
    if (!aggregator) return [];
    return aggregator.getState().connections;
  }

  /**
   * Stop all chat aggregators (for graceful shutdown)
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.aggregators.keys()).map((id) =>
      this.stopChat(id)
    );
    await Promise.allSettled(stopPromises);
  }
}

// Singleton instance
let chatServiceInstance: ChatService | null = null;

export function createChatService(db: Database, encryptionKey: string): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService(db, encryptionKey);
  }
  return chatServiceInstance;
}

export function getChatService(): ChatService | null {
  return chatServiceInstance;
}
