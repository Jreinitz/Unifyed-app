import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, count, sum } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';
import { getChatService, createChatService } from '../services/chat.service.js';
import { liveSessions, orders, checkoutSessions, attributionContexts } from '@unifyed/db/schema';
import type { ChatMessage, ChatState, ChatPlatform } from '@unifyed/types';

// Request schemas
const sendMessageSchema = z.object({
  content: z.string().min(1).max(500),
  platforms: z.array(z.enum(['tiktok', 'youtube', 'twitch'])).optional(),
});

const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(100),
  platform: z.enum(['tiktok', 'youtube', 'twitch']).optional(),
});

export async function chatRoutes(fastify: FastifyInstance) {
  // Ensure chat service is initialized
  if (!getChatService()) {
    createChatService(fastify.db);
  }

  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /chat/status
   * Get current chat status and connection info
   */
  fastify.get('/status', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const creatorId = request.creator.id;
    const isActive = chatService.isActive(creatorId);
    const state = chatService.getChatState(creatorId);

    return reply.send({
      active: isActive,
      state: state,
      connections: chatService.getConnectionStatuses(creatorId),
    });
  });

  /**
   * POST /chat/start
   * Start chat aggregation
   */
  fastify.post('/start', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const creatorId = request.creator.id;

    try {
      const aggregator = await chatService.startChat(creatorId);
      const state = aggregator.getState();

      return reply.send({
        success: true,
        message: 'Chat started',
        state,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start chat';
      throw new AppError(ErrorCodes.INTEGRATION_ERROR, message);
    }
  });

  /**
   * POST /chat/stop
   * Stop chat aggregation
   */
  fastify.post('/stop', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const creatorId = request.creator.id;
    await chatService.stopChat(creatorId);

    return reply.send({
      success: true,
      message: 'Chat stopped',
    });
  });

  /**
   * GET /chat/messages
   * Get recent chat messages
   */
  fastify.get('/messages', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const { limit, platform } = getMessagesQuerySchema.parse(request.query);
    const creatorId = request.creator.id;

    const aggregator = chatService.getAggregator(creatorId);
    if (!aggregator) {
      return reply.send({
        messages: [],
        active: false,
      });
    }

    let messages: ChatMessage[];
    if (platform) {
      messages = aggregator.getMessagesByPlatform(platform, limit);
    } else {
      messages = aggregator.getMessages(limit);
    }

    return reply.send({
      messages,
      active: true,
      messageCount: messages.length,
    });
  });

  /**
   * POST /chat/send
   * Send a message to chat
   */
  fastify.post('/send', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const { content, platforms } = sendMessageSchema.parse(request.body);
    const creatorId = request.creator.id;

    try {
      await chatService.sendMessage(creatorId, content, platforms as ChatPlatform[] | undefined);
      return reply.send({
        success: true,
        message: 'Message sent',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      throw new AppError(ErrorCodes.INTEGRATION_ERROR, message);
    }
  });
}

/**
 * WebSocket handler for real-time chat
 * Set up as a separate route with websocket support
 */
export async function chatWebSocketRoutes(fastify: FastifyInstance) {
  // Register WebSocket support for this route
  fastify.get('/ws', { websocket: true }, (socket, request) => {
    // Authenticate via query param or header
    const token = (request.query as { token?: string }).token;
    
    if (!token) {
      socket.close(4001, 'Authentication required');
      return;
    }

    // Verify token and get creator ID
    let creatorId: string;
    
    try {
      // For now, we'll extract creator ID from the session
      // In production, verify the token properly
      const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64').toString());
      creatorId = payload.sub || payload.creator_id;
      
      if (!creatorId) {
        socket.close(4001, 'Invalid token');
        return;
      }
    } catch {
      socket.close(4001, 'Invalid token');
      return;
    }

    const chatService = getChatService();
    if (!chatService) {
      socket.close(4003, 'Chat service not available');
      return;
    }

    console.log(`💬 WebSocket connected for creator ${creatorId}`);

    // Subscribe to messages
    const unsubMessage = chatService.onMessage(creatorId, (message: ChatMessage) => {
      try {
        socket.send(JSON.stringify({
          type: 'message',
          data: message,
        }));
      } catch {
        // Socket might be closed
      }
    });

    // Subscribe to state changes
    const unsubState = chatService.onStateChange(creatorId, (state: ChatState) => {
      try {
        socket.send(JSON.stringify({
          type: 'state',
          data: state,
        }));
      } catch {
        // Socket might be closed
      }
    });

    // Send initial state
    const currentState = chatService.getChatState(creatorId);
    if (currentState) {
      socket.send(JSON.stringify({
        type: 'state',
        data: currentState,
      }));
    }

    // Send recent messages
    const recentMessages = chatService.getMessages(creatorId, 50);
    if (recentMessages.length > 0) {
      socket.send(JSON.stringify({
        type: 'history',
        data: recentMessages,
      }));
    }

    // Session stats polling
    let statsIntervalId: NodeJS.Timeout | null = null;

    const fetchAndSendSessionStats = async () => {
      try {
        // Find current live session
        const [session] = await fastify.db
          .select()
          .from(liveSessions)
          .where(and(
            eq(liveSessions.creatorId, creatorId),
            eq(liveSessions.status, 'live')
          ))
          .limit(1);

        if (!session) {
          // No live session, send empty stats
          socket.send(JSON.stringify({
            type: 'session_stats',
            data: { isLive: false, stats: null },
          }));
          return;
        }

        // Get orders attributed to this session
        const orderStats = await fastify.db
          .select({
            orderCount: count(orders.id),
            totalRevenue: sum(orders.totalAmount),
          })
          .from(orders)
          .innerJoin(attributionContexts, eq(orders.attributionContextId, attributionContexts.id))
          .where(eq(attributionContexts.liveSessionId, session.id));

        // Get checkout sessions for conversion rate
        const checkoutStats = await fastify.db
          .select({
            checkoutCount: count(checkoutSessions.id),
          })
          .from(checkoutSessions)
          .innerJoin(attributionContexts, eq(checkoutSessions.attributionContextId, attributionContexts.id))
          .where(eq(attributionContexts.liveSessionId, session.id));

        const orderCount = Number(orderStats[0]?.orderCount || 0);
        const totalRevenue = Number(orderStats[0]?.totalRevenue || 0);
        const checkoutCount = Number(checkoutStats[0]?.checkoutCount || 0);
        const conversionRate = checkoutCount > 0 ? (orderCount / checkoutCount) * 100 : 0;

        // Calculate duration
        let duration = 0;
        if (session.startedAt) {
          duration = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
        }

        const viewsByPlatform = session.viewsByPlatform as Record<string, number> | null;

        socket.send(JSON.stringify({
          type: 'session_stats',
          data: {
            isLive: true,
            sessionId: session.id,
            title: session.title,
            duration,
            stats: {
              revenue: totalRevenue,
              orders: orderCount,
              checkouts: checkoutCount,
              conversionRate: Math.round(conversionRate * 10) / 10,
              totalViewers: session.totalViews || 0,
              peakViewers: session.totalPeakViewers || 0,
              viewsByPlatform: viewsByPlatform || {},
            },
          },
        }));
      } catch (error) {
        console.error('Failed to fetch session stats:', error);
      }
    };

    // Start session stats polling (every 30 seconds)
    fetchAndSendSessionStats(); // Send initial stats
    statsIntervalId = setInterval(fetchAndSendSessionStats, 30000);

    // Handle incoming messages
    socket.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.action) {
          case 'send':
            if (message.content) {
              await chatService.sendMessage(creatorId, message.content, message.platforms);
            }
            break;

          case 'start':
            if (!chatService.isActive(creatorId)) {
              await chatService.startChat(creatorId);
            }
            break;

          case 'stop':
            await chatService.stopChat(creatorId);
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        socket.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    });

    // Clean up on disconnect
    socket.on('close', () => {
      console.log(`💬 WebSocket disconnected for creator ${creatorId}`);
      unsubMessage();
      unsubState();
      if (statsIntervalId) {
        clearInterval(statsIntervalId);
      }
    });
  });
}
