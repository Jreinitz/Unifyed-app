import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';
import { getChatService } from '../services/chat.service.js';
import { 
  analyzeMessage, 
  analyzeMessages, 
  getSuggestedActions
} from '../services/ai-chat.service.js';
import { offers } from '@unifyed/db/schema';
import type { ChatMessage } from '@unifyed/types';

// Request schemas
const analyzeMessageSchema = z.object({
  content: z.string().min(1).max(1000),
});

const batchAnalyzeSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    content: z.string(),
    platform: z.string(),
    type: z.string().optional(),
  })).max(100),
});

export async function chatAIRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * POST /chat-ai/analyze
   * Analyze a single message for buying signals
   */
  fastify.post('/analyze', async (request, reply) => {
    const { content } = analyzeMessageSchema.parse(request.body);

    // Create a mock message for analysis
    const mockMessage: ChatMessage = {
      id: 'temp',
      platform: 'restream',
      type: 'chat',
      content,
      user: {
        id: 'temp',
        username: 'test',
        badges: [],
        isModerator: false,
        isSubscriber: false,
        isVerified: false,
      },
      timestamp: new Date(),
    };

    const signals = analyzeMessage(mockMessage);

    return reply.send({
      signals,
      content,
    });
  });

  /**
   * POST /chat-ai/batch-analyze
   * Analyze multiple messages at once
   */
  fastify.post('/batch-analyze', async (request, reply) => {
    const { messages } = batchAnalyzeSchema.parse(request.body);

    // Convert to ChatMessage format
    const chatMessages: ChatMessage[] = messages.map(m => ({
      id: m.id,
      platform: m.platform as ChatMessage['platform'],
      type: (m.type || 'chat') as ChatMessage['type'],
      content: m.content,
      user: {
        id: 'unknown',
        username: 'unknown',
        badges: [],
        isModerator: false,
        isSubscriber: false,
        isVerified: false,
      },
      timestamp: new Date(),
    }));

    const results = analyzeMessages(chatMessages);

    return reply.send({
      results: results.map(r => ({
        messageId: r.message.id,
        content: r.message.content,
        signals: r.signals,
        priority: r.priority,
      })),
      summary: {
        total: results.length,
        highPriority: results.filter(r => r.priority === 'high').length,
        buyingIntents: results.filter(r => r.signals.hasBuyingIntent).length,
        questions: results.filter(r => r.signals.isQuestion).length,
      },
    });
  });

  /**
   * GET /chat-ai/suggestions
   * Get suggested actions based on recent chat
   */
  fastify.get('/suggestions', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const creatorId = request.creator.id;

    // Get recent messages
    const messages = chatService.getMessages(creatorId, 100);

    // Get active offer IDs
    const activeOffers = await fastify.db
      .select({ id: offers.id })
      .from(offers)
      .where(and(
        eq(offers.creatorId, creatorId),
        eq(offers.status, 'active')
      ));

    const activeOfferIds = activeOffers.map(o => o.id);

    // Get suggestions
    const actions = getSuggestedActions(messages, activeOfferIds);

    // Get stats
    const analyzed = analyzeMessages(messages);

    return reply.send({
      suggestions: actions,
      stats: {
        totalMessages: messages.length,
        buyingIntents: analyzed.filter(r => r.signals.hasBuyingIntent).length,
        questions: analyzed.filter(r => r.signals.isQuestion).length,
        highPriority: analyzed.filter(r => r.priority === 'high').length,
      },
      topSignals: analyzed
        .filter(r => r.priority === 'high')
        .slice(0, 10)
        .map(r => ({
          messageId: r.message.id,
          username: r.message.user.username,
          content: r.message.content,
          platform: r.message.platform,
          signals: r.signals,
        })),
    });
  });

  /**
   * GET /chat-ai/analysis
   * Get full analysis of current chat session
   */
  fastify.get('/analysis', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const creatorId = request.creator.id;

    // Get all messages
    const messages = chatService.getMessages(creatorId);

    if (messages.length === 0) {
      return reply.send({
        analysis: {
          totalMessages: 0,
          buyingIntents: 0,
          questions: 0,
          sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
          topKeywords: [],
        },
        signals: [],
        suggestions: [],
      });
    }

    // Analyze all messages
    const analyzed = analyzeMessages(messages);

    // Get active offers
    const activeOffers = await fastify.db
      .select({ id: offers.id })
      .from(offers)
      .where(and(
        eq(offers.creatorId, creatorId),
        eq(offers.status, 'active')
      ));

    const activeOfferIds = activeOffers.map(o => o.id);

    // Get suggestions
    const actions = getSuggestedActions(messages, activeOfferIds);

    // Calculate sentiment breakdown
    const sentimentBreakdown = {
      positive: analyzed.filter(r => r.signals.sentiment === 'positive').length,
      neutral: analyzed.filter(r => r.signals.sentiment === 'neutral').length,
      negative: analyzed.filter(r => r.signals.sentiment === 'negative').length,
    };

    // Get top keywords
    const keywordCounts = new Map<string, number>();
    analyzed.forEach(r => {
      r.signals.keywords.forEach(kw => {
        keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
      });
    });

    const topKeywords = [...keywordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    return reply.send({
      analysis: {
        totalMessages: messages.length,
        buyingIntents: analyzed.filter(r => r.signals.hasBuyingIntent).length,
        questions: analyzed.filter(r => r.signals.isQuestion).length,
        sentimentBreakdown,
        topKeywords,
        highPriorityCount: analyzed.filter(r => r.priority === 'high').length,
      },
      signals: analyzed
        .filter(r => r.priority !== 'low')
        .slice(0, 50)
        .map(r => ({
          messageId: r.message.id,
          username: r.message.user.username,
          content: r.message.content,
          platform: r.message.platform,
          type: r.message.type,
          priority: r.priority,
          signals: r.signals,
          timestamp: r.message.timestamp,
        })),
      suggestions: actions,
    });
  });

  /**
   * WebSocket endpoint for real-time AI signals
   * Enriches messages with AI signals as they come in
   */
  // Note: The main chat WebSocket in chat.ts should be updated to include
  // AI processing. For now, this provides a REST-based polling alternative.
}
