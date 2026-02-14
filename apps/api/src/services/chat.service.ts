import { ChatAggregator, createChatAggregator, type PlatformConfig } from '@unifyed/chat';
import type { ChatMessage, ChatConnectionStatus, ChatState, ChatPlatform } from '@unifyed/types';
import type { Database } from '@unifyed/db';
import { eq, and } from 'drizzle-orm';
import { platformConnections } from '@unifyed/db/schema';
import { decrypt, encrypt } from '@unifyed/utils';
import * as youtubeIntegration from '@unifyed/integrations-youtube';
import * as twitchIntegration from '@unifyed/integrations-twitch';
import { processMessage } from './ai-chat.service.js';

/**
 * Chat Service
 * Manages chat aggregators for each creator and provides unified chat access
 */
interface OAuthConfig {
  youtubeClientId?: string | undefined;
  youtubeClientSecret?: string | undefined;
  twitchClientId?: string | undefined;
  twitchClientSecret?: string | undefined;
}

export class ChatService {
  private aggregators: Map<string, ChatAggregator> = new Map();
  private messageCallbacks: Map<string, Set<(message: ChatMessage) => void>> = new Map();
  private stateCallbacks: Map<string, Set<(state: ChatState) => void>> = new Map();

  constructor(
    private db: Database,
    private encryptionKey: string,
    private oauthConfig: OAuthConfig = {},
  ) {}

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
   * Auto-refresh an expired token for a platform connection.
   * Returns the new access token or null if refresh failed.
   */
  private async refreshTokenIfExpired(
    conn: { id: string; platform: string; credentials: string; tokenExpiresAt: Date | null; metadata: unknown },
  ): Promise<string | null> {
    // Decrypt current credentials
    let credentials: { accessToken?: string; refreshToken?: string; scope?: string };
    try {
      const decrypted = decrypt(conn.credentials, this.encryptionKey);
      credentials = JSON.parse(decrypted);
    } catch {
      return null;
    }

    // Check if token is still valid (with 5 min buffer)
    if (conn.tokenExpiresAt) {
      const expiresAt = new Date(conn.tokenExpiresAt).getTime();
      const now = Date.now();
      if (expiresAt > now + 5 * 60 * 1000) {
        // Token still valid
        return credentials.accessToken || null;
      }
    }

    // Token expired or no expiry info - try to refresh
    if (!credentials.refreshToken) {
      console.warn(`💬 ${conn.platform}: no refresh token available, cannot auto-refresh`);
      return credentials.accessToken || null; // Return existing token, might still work
    }

    console.log(`💬 ${conn.platform}: token expired, auto-refreshing...`);

    try {
      let newAccessToken: string;
      let newExpiresIn: number;

      if (conn.platform === 'youtube' && this.oauthConfig.youtubeClientId && this.oauthConfig.youtubeClientSecret) {
        const result = await youtubeIntegration.refreshAccessToken(credentials.refreshToken, {
          clientId: this.oauthConfig.youtubeClientId,
          clientSecret: this.oauthConfig.youtubeClientSecret,
          redirectUri: '', // Not needed for refresh
        });
        newAccessToken = result.accessToken;
        newExpiresIn = result.expiresIn;
      } else if (conn.platform === 'twitch' && this.oauthConfig.twitchClientId && this.oauthConfig.twitchClientSecret) {
        const result = await twitchIntegration.refreshAccessToken(credentials.refreshToken, {
          clientId: this.oauthConfig.twitchClientId,
          clientSecret: this.oauthConfig.twitchClientSecret,
          redirectUri: '', // Not needed for refresh
        });
        newAccessToken = result.accessToken;
        newExpiresIn = result.expiresIn;
        // Twitch may return a new refresh token
        if (result.refreshToken) {
          credentials.refreshToken = result.refreshToken;
        }
      } else {
        console.warn(`💬 ${conn.platform}: OAuth config not available for auto-refresh`);
        return credentials.accessToken || null;
      }

      // Update credentials in the database
      credentials.accessToken = newAccessToken;
      const encryptedCredentials = encrypt(JSON.stringify(credentials), this.encryptionKey);

      await this.db
        .update(platformConnections)
        .set({
          credentials: encryptedCredentials,
          tokenExpiresAt: new Date(Date.now() + newExpiresIn * 1000),
          lastSyncAt: new Date(),
          lastError: null,
          status: 'healthy',
        })
        .where(eq(platformConnections.id, conn.id));

      console.log(`💬 ${conn.platform}: token refreshed successfully, expires in ${newExpiresIn}s`);
      return newAccessToken;
    } catch (error) {
      console.error(`💬 ${conn.platform}: token refresh failed:`, error instanceof Error ? error.message : error);
      // Mark connection as degraded
      await this.db
        .update(platformConnections)
        .set({
          status: 'degraded',
          lastError: `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
        .where(eq(platformConnections.id, conn.id));
      return null;
    }
  }

  /**
   * Get connection configs for a creator from the database
   */
  private async getConnectionConfigs(creatorId: string): Promise<PlatformConfig[]> {
    const configs: PlatformConfig[] = [];

    // NOTE: Restream is used for stream relay but does NOT have a public chat API.
    // Always use direct platform connections (YouTube, Twitch) for chat.
    console.log(`💬 Building chat configs for creator ${creatorId} using direct platform connections`);

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

      // Parse metadata (may contain login name, profile info, etc.)
      const metadata = (conn.metadata || {}) as Record<string, unknown>;
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
            console.log(`💬 Added TikTok chat config for ${conn.displayName}`);
          }
          break;

        case 'youtube': {
          // Auto-refresh token if expired
          const ytToken = await this.refreshTokenIfExpired(conn);
          if (ytToken) {
            configs.push({
              platform: 'youtube',
              enabled: true,
              config: {
                creatorId,
                accessToken: ytToken,
              },
            });
            console.log(`💬 Added YouTube chat config for ${conn.displayName || conn.externalId}`);
          } else {
            console.warn(`💬 YouTube: no valid accessToken available, skipping`);
          }
          break;
        }

        case 'twitch': {
          // Auto-refresh token if expired
          const twitchToken = await this.refreshTokenIfExpired(conn);

          // Twitch IRC needs the login name (lowercase), not the numeric user ID
          const twitchLogin = (metadata['login'] as string) || conn.displayName?.toLowerCase();
          const twitchUsername = conn.displayName || (metadata['login'] as string);

          if (twitchToken && twitchLogin) {
            configs.push({
              platform: 'twitch',
              enabled: true,
              config: {
                creatorId,
                accessToken: twitchToken,
                username: twitchUsername!,
                channelId: twitchLogin, // IRC channel = login name, NOT numeric ID
              },
            });
            console.log(`💬 Added Twitch chat config for #${twitchLogin} (${twitchUsername})`);
          } else {
            console.warn(`💬 Twitch: missing token or login name, skipping (has token: ${!!twitchToken}, login: ${twitchLogin})`);
          }
          break;
        }
      }
    }

    console.log(`💬 Found ${platformConns.length} platform connection(s), built ${configs.length} chat config(s): ${configs.map(c => c.platform).join(', ') || 'none'}`);
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

export function createChatService(db: Database, encryptionKey: string, oauthConfig?: OAuthConfig): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService(db, encryptionKey, oauthConfig);
  }
  return chatServiceInstance;
}

export function getChatService(): ChatService | null {
  return chatServiceInstance;
}
