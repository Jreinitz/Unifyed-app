import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { platformConnections, streamingToolConnections } from '@unifyed/db/schema';
import { 
  getAuthUrlParamsSchema,
  getAuthUrlQuerySchema,
  deleteConnectionParamsSchema,
  type ListConnectionsResponse,
  type GetAuthUrlResponse,
  type DeleteConnectionResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes, generateId, encrypt } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import { authPlugin } from '../plugins/auth.js';
import { env } from '../config/env.js';

// Integration adapters
import * as shopifyIntegration from '@unifyed/integrations-shopify';
import * as tiktokIntegration from '@unifyed/integrations-tiktok';
import * as youtubeIntegration from '@unifyed/integrations-youtube';
import * as twitchIntegration from '@unifyed/integrations-twitch';
import * as restreamIntegration from '@unifyed/integrations-restream';

export async function connectionsRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);

  // GET /connections - List all connections for creator (no auth check on hook - checked per route)
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const connections = await fastify.db
      .select({
        id: platformConnections.id,
        creatorId: platformConnections.creatorId,
        platform: platformConnections.platform,
        externalId: platformConnections.externalId,
        displayName: platformConnections.displayName,
        status: platformConnections.status,
        lastSyncAt: platformConnections.lastSyncAt,
        lastError: platformConnections.lastError,
        tokenExpiresAt: platformConnections.tokenExpiresAt,
        metadata: platformConnections.metadata,
        createdAt: platformConnections.createdAt,
        updatedAt: platformConnections.updatedAt,
      })
      .from(platformConnections)
      .where(eq(platformConnections.creatorId, request.creator.id));

    const response: ListConnectionsResponse = { connections };
    return reply.send(response);
  });

  // GET /connections/:platform/auth-url - Get OAuth URL (authenticated)
  fastify.get('/:platform/auth-url', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { platform } = getAuthUrlParamsSchema.parse(request.params);
    const query = getAuthUrlQuerySchema.parse(request.query);

    const state = generateId(32);
    
    // Store state in Redis for verification (5 minute expiry)
    // Include shop domain for Shopify since we need it in the callback
    await fastify.redis.setex(
      `oauth:state:${state}`,
      300,
      JSON.stringify({ 
        creatorId: request.creator.id, 
        platform,
        shop: query.shop, // Store shop for Shopify callbacks
      })
    );

    let authUrl: string;

    switch (platform) {
      case 'shopify': {
        if (!query.shop) {
          throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Shop domain is required for Shopify');
        }
        if (!env.SHOPIFY_CLIENT_ID) {
          throw new AppError(ErrorCodes.INTEGRATION_ERROR, 'Shopify integration not configured');
        }
        const redirectUri = `${env.API_URL}/connections/shopify/callback`;
        authUrl = shopifyIntegration.generateAuthUrl(query.shop, {
          clientId: env.SHOPIFY_CLIENT_ID,
          clientSecret: env.SHOPIFY_CLIENT_SECRET || '',
          scopes: env.SHOPIFY_SCOPES,
          redirectUri,
        }, state);
        break;
      }

      case 'tiktok': {
        if (!env.TIKTOK_CLIENT_KEY) {
          throw new AppError(ErrorCodes.INTEGRATION_ERROR, 'TikTok integration not configured');
        }
        const redirectUri = `${env.API_URL}/connections/tiktok/callback`;
        authUrl = tiktokIntegration.generateAuthUrl({
          clientKey: env.TIKTOK_CLIENT_KEY,
          clientSecret: env.TIKTOK_CLIENT_SECRET || '',
          redirectUri,
        }, state);
        break;
      }

      case 'youtube': {
        if (!env.YOUTUBE_CLIENT_ID) {
          throw new AppError(ErrorCodes.INTEGRATION_ERROR, 'YouTube integration not configured');
        }
        const redirectUri = `${env.API_URL}/connections/youtube/callback`;
        authUrl = youtubeIntegration.generateAuthUrl({
          clientId: env.YOUTUBE_CLIENT_ID,
          clientSecret: env.YOUTUBE_CLIENT_SECRET || '',
          redirectUri,
        }, state);
        break;
      }

      case 'twitch': {
        if (!env.TWITCH_CLIENT_ID) {
          throw new AppError(ErrorCodes.INTEGRATION_ERROR, 'Twitch integration not configured');
        }
        const redirectUri = `${env.API_URL}/connections/twitch/callback`;
        authUrl = twitchIntegration.generateAuthUrl({
          clientId: env.TWITCH_CLIENT_ID,
          clientSecret: env.TWITCH_CLIENT_SECRET || '',
          redirectUri,
        }, state);
        break;
      }

      default:
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Platform ${platform} not supported`);
    }

    const response: GetAuthUrlResponse = { authUrl, state };
    return reply.send(response);
  });

  // GET /connections/:platform/callback - OAuth callback (public, redirected from OAuth provider)
  fastify.get('/:platform/callback', async (request, reply) => {
    const { platform } = getAuthUrlParamsSchema.parse(request.params);
    const { code, state, error, error_description } = request.query as Record<string, string>;

    if (error) {
      // Redirect to frontend with error
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!state || !code) {
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=invalid_callback`);
    }

    // Verify state
    const stateData = await fastify.redis.get(`oauth:state:${state}`);
    if (!stateData) {
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=state_expired`);
    }

    const { creatorId, shop: storedShop } = JSON.parse(stateData) as { 
      creatorId: string; 
      platform: string;
      shop?: string;
    };
    await fastify.redis.del(`oauth:state:${state}`);

    try {
      let credentials: Record<string, unknown>;
      let externalId: string;
      let displayName: string;
      let tokenExpiresAt: Date | undefined;
      let metadata: Record<string, unknown> = {};

      switch (platform) {
        case 'shopify': {
          if (!storedShop) {
            return reply.redirect(`${env.APP_URL}/dashboard/connections?error=missing_shop`);
          }
          const shopDomain = storedShop.replace('.myshopify.com', '');
          
          // Exchange code for permanent access token using the adapter
          const tokenResult = await shopifyIntegration.exchangeCodeForToken(shopDomain, code, {
            clientId: env.SHOPIFY_CLIENT_ID!,
            clientSecret: env.SHOPIFY_CLIENT_SECRET!,
            scopes: env.SHOPIFY_SCOPES,
            redirectUri: `${env.API_URL}/connections/shopify/callback`,
          });
          
          credentials = { 
            accessToken: tokenResult.accessToken, 
            shopDomain,
            scope: tokenResult.scope,
          };
          externalId = shopDomain;
          displayName = shopDomain;
          // Shopify access tokens don't expire
          tokenExpiresAt = undefined;
          break;
        }
        
        case 'tiktok': {
          // Exchange code for tokens using the TikTok adapter
          const tokenResult = await tiktokIntegration.exchangeCodeForTokens(code, {
            clientKey: env.TIKTOK_CLIENT_KEY!,
            clientSecret: env.TIKTOK_CLIENT_SECRET!,
            redirectUri: `${env.API_URL}/connections/tiktok/callback`,
          });
          
          // Get user info
          const userInfo = await tiktokIntegration.getUserInfo(tokenResult.accessToken);
          
          credentials = {
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
            openId: tokenResult.openId,
            scope: tokenResult.scope,
          };
          externalId = tokenResult.openId;
          displayName = userInfo.displayName || 'TikTok Account';
          tokenExpiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);
          metadata = {
            avatarUrl: userInfo.avatarUrl100 || userInfo.avatarUrl,
            followerCount: userInfo.followerCount,
            videoCount: userInfo.videoCount,
          };
          break;
        }
        
        case 'youtube': {
          // Exchange code for tokens using the YouTube adapter
          const tokenResult = await youtubeIntegration.exchangeCodeForTokens(code, {
            clientId: env.YOUTUBE_CLIENT_ID!,
            clientSecret: env.YOUTUBE_CLIENT_SECRET!,
            redirectUri: `${env.API_URL}/connections/youtube/callback`,
          });
          
          // Get channel info
          const channelInfo = await youtubeIntegration.getChannelInfo(tokenResult.accessToken);
          
          credentials = {
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
          };
          
          if (channelInfo) {
            externalId = channelInfo.id;
            displayName = channelInfo.title;
            metadata = {
              thumbnailUrl: channelInfo.thumbnailUrl,
              subscriberCount: channelInfo.subscriberCount,
            };
          } else {
            externalId = 'unknown';
            displayName = 'YouTube Channel';
          }
          
          tokenExpiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);
          break;
        }
        
        case 'twitch': {
          // Exchange code for tokens using the Twitch adapter
          const tokenResult = await twitchIntegration.exchangeCodeForTokens(code, {
            clientId: env.TWITCH_CLIENT_ID!,
            clientSecret: env.TWITCH_CLIENT_SECRET!,
            redirectUri: `${env.API_URL}/connections/twitch/callback`,
          });
          
          // Get user info
          const userInfo = await twitchIntegration.getUserInfo(
            tokenResult.accessToken,
            env.TWITCH_CLIENT_ID!
          );
          
          credentials = {
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
            scope: tokenResult.scope,
          };
          
          if (userInfo) {
            externalId = userInfo.id;
            displayName = userInfo.displayName;
            metadata = {
              login: userInfo.login,
              profileImageUrl: userInfo.profileImageUrl,
              broadcasterType: userInfo.broadcasterType,
              viewCount: userInfo.viewCount,
            };
          } else {
            externalId = 'unknown';
            displayName = 'Twitch Account';
          }
          
          tokenExpiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);
          break;
        }
        
        default:
          return reply.redirect(`${env.APP_URL}/dashboard/connections?error=unsupported_platform`);
      }

      // Encrypt credentials
      const encryptedCredentials = encrypt(
        JSON.stringify(credentials),
        env.CREDENTIALS_ENCRYPTION_KEY
      );

      // Create or update connection (upsert on creator_id + platform unique constraint)
      const [connection] = await fastify.db
        .insert(platformConnections)
        .values({
          creatorId,
          platform,
          credentials: encryptedCredentials,
          externalId,
          displayName,
          status: 'healthy',
          tokenExpiresAt,
          lastSyncAt: new Date(),
          metadata,
        })
        .onConflictDoUpdate({
          target: [platformConnections.creatorId, platformConnections.platform],
          set: {
            credentials: encryptedCredentials,
            externalId,
            displayName,
            status: 'healthy',
            tokenExpiresAt,
            lastSyncAt: new Date(),
            lastError: null,
            metadata,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!connection) {
        return reply.redirect(`${env.APP_URL}/dashboard/connections?error=save_failed`);
      }

      // Emit event
      await fastify.emitEvent(EVENT_TYPES.PLATFORM_CONNECTED, {
        connectionId: connection.id,
        platform,
        externalId,
        displayName,
      }, { creatorId });

      // Queue initial sync for Shopify (catalog sync)
      if (platform === 'shopify') {
        await fastify.queues.catalogSync.add(
          'sync',
          { connectionId: connection.id },
          { jobId: `initial-sync-${connection.id}` }
        );
      }

      return reply.redirect(`${env.APP_URL}/dashboard/connections?success=true&platform=${platform}`);
    } catch (err) {
      request.log.error(err, 'OAuth callback error');
      const errorMessage = err instanceof Error ? err.message : 'callback_failed';
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=${encodeURIComponent(errorMessage)}`);
    }
  });

  // DELETE /connections/:id - Disconnect a platform
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = deleteConnectionParamsSchema.parse(request.params);

    const [connection] = await fastify.db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.id, id),
          eq(platformConnections.creatorId, request.creator.id)
        )
      )
      .limit(1);

    if (!connection) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Connection not found');
    }

    await fastify.db
      .delete(platformConnections)
      .where(eq(platformConnections.id, id));

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.PLATFORM_DISCONNECTED, {
      connectionId: id,
      platform: connection.platform,
      reason: 'manual_disconnect',
    }, { creatorId: request.creator.id });

    const response: DeleteConnectionResponse = { success: true };
    return reply.send(response);
  });

  // POST /connections/:id/refresh - Refresh connection tokens (for TikTok/YouTube)
  fastify.post('/:id/refresh', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = deleteConnectionParamsSchema.parse(request.params);

    const [connection] = await fastify.db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.id, id),
          eq(platformConnections.creatorId, request.creator.id)
        )
      )
      .limit(1);

    if (!connection) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Connection not found');
    }

    if (connection.platform === 'shopify') {
      // Shopify tokens don't expire
      return reply.send({ success: true, message: 'Shopify tokens do not expire' });
    }

    try {
      const { decrypt } = await import('@unifyed/utils');
      const currentCredentials = JSON.parse(
        decrypt(connection.credentials, env.CREDENTIALS_ENCRYPTION_KEY)
      ) as { refreshToken?: string };

      if (!currentCredentials.refreshToken) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No refresh token available');
      }

      let newCredentials: Record<string, unknown>;
      let tokenExpiresAt: Date;

      if (connection.platform === 'tiktok') {
        const result = await tiktokIntegration.refreshAccessToken(currentCredentials.refreshToken, {
          clientKey: env.TIKTOK_CLIENT_KEY!,
          clientSecret: env.TIKTOK_CLIENT_SECRET!,
          redirectUri: `${env.API_URL}/connections/tiktok/callback`,
        });
        newCredentials = {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          openId: result.openId,
          scope: result.scope,
        };
        tokenExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
      } else if (connection.platform === 'youtube') {
        const result = await youtubeIntegration.refreshAccessToken(currentCredentials.refreshToken, {
          clientId: env.YOUTUBE_CLIENT_ID!,
          clientSecret: env.YOUTUBE_CLIENT_SECRET!,
          redirectUri: `${env.API_URL}/connections/youtube/callback`,
        });
        newCredentials = {
          accessToken: result.accessToken,
          refreshToken: currentCredentials.refreshToken, // Keep the original refresh token
        };
        tokenExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
      } else if (connection.platform === 'twitch') {
        const result = await twitchIntegration.refreshAccessToken(currentCredentials.refreshToken, {
          clientId: env.TWITCH_CLIENT_ID!,
          clientSecret: env.TWITCH_CLIENT_SECRET!,
          redirectUri: `${env.API_URL}/connections/twitch/callback`,
        });
        newCredentials = {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          scope: result.scope,
        };
        tokenExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
      } else {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Platform does not support token refresh');
      }

      const encryptedCredentials = encrypt(
        JSON.stringify(newCredentials),
        env.CREDENTIALS_ENCRYPTION_KEY
      );

      await fastify.db
        .update(platformConnections)
        .set({
          credentials: encryptedCredentials,
          tokenExpiresAt,
          status: 'healthy',
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(platformConnections.id, id));

      return reply.send({ success: true, tokenExpiresAt });
    } catch (err) {
      request.log.error(err, 'Token refresh error');
      
      // Mark connection as degraded
      await fastify.db
        .update(platformConnections)
        .set({
          status: 'degraded',
          lastError: err instanceof Error ? err.message : 'Token refresh failed',
          updatedAt: new Date(),
        })
        .where(eq(platformConnections.id, id));

      throw new AppError(ErrorCodes.INTEGRATION_ERROR, 'Failed to refresh token');
    }
  });

  // ============================================
  // Streaming Tool Connections (Restream, etc.)
  // ============================================

  // GET /connections/tools - List streaming tool connections
  fastify.get('/tools', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const connections = await fastify.db
      .select({
        id: streamingToolConnections.id,
        creatorId: streamingToolConnections.creatorId,
        tool: streamingToolConnections.tool,
        externalId: streamingToolConnections.externalId,
        displayName: streamingToolConnections.displayName,
        status: streamingToolConnections.status,
        lastSyncAt: streamingToolConnections.lastSyncAt,
        lastError: streamingToolConnections.lastError,
        tokenExpiresAt: streamingToolConnections.tokenExpiresAt,
        metadata: streamingToolConnections.metadata,
        createdAt: streamingToolConnections.createdAt,
        updatedAt: streamingToolConnections.updatedAt,
      })
      .from(streamingToolConnections)
      .where(eq(streamingToolConnections.creatorId, request.creator.id));

    return reply.send({ connections });
  });

  // GET /connections/tools/:tool/auth-url - Get streaming tool OAuth URL
  fastify.get('/tools/:tool/auth-url', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { tool } = request.params as { tool: string };

    const state = generateId(32);
    
    await fastify.redis.setex(
      `oauth:state:${state}`,
      300,
      JSON.stringify({ 
        creatorId: request.creator.id, 
        tool,
        isStreamingTool: true,
      })
    );

    let authUrl: string;

    switch (tool) {
      case 'restream': {
        if (!env.RESTREAM_CLIENT_ID) {
          throw new AppError(ErrorCodes.INTEGRATION_ERROR, 'Restream integration not configured');
        }
        const redirectUri = `${env.API_URL}/connections/tools/restream/callback`;
        authUrl = restreamIntegration.generateAuthUrl({
          clientId: env.RESTREAM_CLIENT_ID,
          clientSecret: env.RESTREAM_CLIENT_SECRET || '',
          redirectUri,
        }, state);
        break;
      }

      default:
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Streaming tool ${tool} not supported`);
    }

    const response: GetAuthUrlResponse = { authUrl, state };
    return reply.send(response);
  });

  // GET /connections/tools/:tool/callback - Streaming tool OAuth callback
  fastify.get('/tools/:tool/callback', async (request, reply) => {
    const { tool } = request.params as { tool: string };
    const { code, state, error, error_description } = request.query as Record<string, string>;

    if (error) {
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!state || !code) {
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=invalid_callback`);
    }

    const stateData = await fastify.redis.get(`oauth:state:${state}`);
    if (!stateData) {
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=state_expired`);
    }

    const { creatorId } = JSON.parse(stateData) as { 
      creatorId: string; 
      tool: string;
      isStreamingTool: boolean;
    };
    await fastify.redis.del(`oauth:state:${state}`);

    try {
      let credentials: Record<string, unknown>;
      let externalId: string;
      let displayName: string;
      let tokenExpiresAt: Date;
      let metadata: Record<string, unknown> = {};

      switch (tool) {
        case 'restream': {
          const tokenResult = await restreamIntegration.exchangeCodeForTokens(code, {
            clientId: env.RESTREAM_CLIENT_ID!,
            clientSecret: env.RESTREAM_CLIENT_SECRET!,
            redirectUri: `${env.API_URL}/connections/tools/restream/callback`,
          });
          
          const userProfile = await restreamIntegration.getUserProfile(tokenResult.accessToken);
          const channels = await restreamIntegration.getChannels(tokenResult.accessToken);
          
          credentials = {
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
            scope: tokenResult.scope,
          };
          externalId = String(userProfile.id);
          displayName = userProfile.username;
          tokenExpiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);
          metadata = {
            email: userProfile.email,
            avatar: userProfile.avatar,
            connectedPlatforms: channels.filter((c: { enabled: boolean }) => c.enabled).map((c: { platform: string }) => c.platform),
          };
          break;
        }
        
        default:
          return reply.redirect(`${env.APP_URL}/dashboard/connections?error=unsupported_tool`);
      }

      const encryptedCredentials = encrypt(
        JSON.stringify(credentials),
        env.CREDENTIALS_ENCRYPTION_KEY
      );

      const [connection] = await fastify.db
        .insert(streamingToolConnections)
        .values({
          creatorId,
          tool: tool as 'restream' | 'streamyard' | 'obs',
          credentials: encryptedCredentials,
          externalId,
          displayName,
          status: 'connected',
          tokenExpiresAt,
          lastSyncAt: new Date(),
          metadata,
        })
        .onConflictDoUpdate({
          target: [streamingToolConnections.creatorId, streamingToolConnections.tool],
          set: {
            credentials: encryptedCredentials,
            externalId,
            displayName,
            status: 'connected',
            tokenExpiresAt,
            lastSyncAt: new Date(),
            lastError: null,
            metadata,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!connection) {
        return reply.redirect(`${env.APP_URL}/dashboard/connections?error=save_failed`);
      }

      // TODO: Create dedicated STREAMING_TOOL_CONNECTED event type
      // For now, skip platform event emission for streaming tools
      fastify.log.info({ connectionId: connection.id, tool }, 'Streaming tool connected');

      return reply.redirect(`${env.APP_URL}/dashboard/connections?success=true&tool=${tool}`);
    } catch (err) {
      request.log.error(err, 'Streaming tool OAuth callback error');
      const errorMessage = err instanceof Error ? err.message : 'callback_failed';
      return reply.redirect(`${env.APP_URL}/dashboard/connections?error=${encodeURIComponent(errorMessage)}`);
    }
  });

  // DELETE /connections/tools/:id - Disconnect a streaming tool
  fastify.delete('/tools/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [connection] = await fastify.db
      .select()
      .from(streamingToolConnections)
      .where(
        and(
          eq(streamingToolConnections.id, id),
          eq(streamingToolConnections.creatorId, request.creator.id)
        )
      )
      .limit(1);

    if (!connection) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Connection not found');
    }

    await fastify.db
      .delete(streamingToolConnections)
      .where(eq(streamingToolConnections.id, id));

    // TODO: Create dedicated STREAMING_TOOL_DISCONNECTED event type
    // For now, skip platform event emission for streaming tools
    fastify.log.info({ connectionId: id, tool: connection.tool }, 'Streaming tool disconnected');

    const response: DeleteConnectionResponse = { success: true };
    return reply.send(response);
  });

  // GET /connections/tools/:id/status - Get streaming tool live status
  fastify.get('/tools/:id/status', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [connection] = await fastify.db
      .select()
      .from(streamingToolConnections)
      .where(
        and(
          eq(streamingToolConnections.id, id),
          eq(streamingToolConnections.creatorId, request.creator.id)
        )
      )
      .limit(1);

    if (!connection) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Connection not found');
    }

    try {
      const { decrypt } = await import('@unifyed/utils');
      const credentials = JSON.parse(
        decrypt(connection.credentials, env.CREDENTIALS_ENCRYPTION_KEY)
      ) as { accessToken: string };

      if (connection.tool === 'restream') {
        const status = await restreamIntegration.checkLiveStatus(credentials.accessToken);
        return reply.send(status);
      }

      return reply.send({ isLive: false });
    } catch (err) {
      request.log.error(err, 'Failed to check streaming tool status');
      return reply.send({ isLive: false, error: 'Failed to check status' });
    }
  });
}
