import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gte } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';
import { getChatService } from '../services/chat.service.js';
import { offers, shortLinks, flashSales, attributionContexts } from '@unifyed/db/schema';
import { randomBytes } from 'crypto';

// Request schemas
const pinOfferSchema = z.object({
  offerId: z.string().uuid(),
  message: z.string().max(500).optional(),
});

const dropLinkSchema = z.object({
  offerId: z.string().uuid(),
  message: z.string().max(500).optional(),
});

const flashSaleSchema = z.object({
  offerId: z.string().uuid(),
  durationMinutes: z.number().min(1).max(60).default(5),
  additionalDiscount: z.number().min(0).max(50).optional(),
  message: z.string().max(500).optional(),
});

const endFlashSaleSchema = z.object({
  flashSaleId: z.string().uuid(),
});

const sendQuickMessageSchema = z.object({
  message: z.string().min(1).max(500),
});

export async function chatCommerceRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // Helper to create a short link with attribution
  async function createOfferLink(
    creatorId: string,
    offerId: string,
    source: string
  ): Promise<{ code: string; linkId: string }> {
    const code = randomBytes(4).toString('hex');

    // Create attribution context
    const [attrCtx] = await fastify.db
      .insert(attributionContexts)
      .values({
        creatorId,
        platform: null, // Will be determined on click
        surface: 'live',
        metadata: { source, chatCommerce: true },
      })
      .returning();

    if (!attrCtx) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create attribution');
    }

    // Create short link
    const [link] = await fastify.db
      .insert(shortLinks)
      .values({
        creatorId,
        code,
        offerId,
        attributionContextId: attrCtx.id,
        name: `Chat ${source}`,
        metadata: { source, createdVia: 'chat_commerce' },
      })
      .returning();

    if (!link) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create link');
    }

    return { code, linkId: link.id };
  }

  /**
   * POST /chat-commerce/pin-offer
   * Pin an offer to chat with a message
   */
  fastify.post('/pin-offer', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const { offerId, message } = pinOfferSchema.parse(request.body);
    const creatorId = request.creator.id;

    // Get the offer
    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    // Create a trackable short link
    const { code } = await createOfferLink(creatorId, offerId, 'pin');

    // Build the chat message
    const discount = offer.type === 'percentage_off'
      ? `${offer.value}% off`
      : `$${(offer.value / 100).toFixed(2)} off`;

    const chatMessage = message
      ? `📌 ${message}\n\n${offer.name} - ${discount}!\n🔗 unifyed.link/${code}`
      : `📌 Deal Alert: ${offer.name}\n💰 ${discount}\n🔗 unifyed.link/${code}`;

    // Send to all platforms
    try {
      await chatService.sendMessage(creatorId, chatMessage);
    } catch {
      // Chat might not be active, continue anyway
    }

    return reply.send({
      success: true,
      offer: {
        id: offer.id,
        name: offer.name,
        discount,
      },
      link: {
        code,
        url: `unifyed.link/${code}`,
      },
      message: chatMessage,
    });
  });

  /**
   * POST /chat-commerce/drop-link
   * Generate and broadcast a short link for an offer
   */
  fastify.post('/drop-link', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const { offerId, message } = dropLinkSchema.parse(request.body);
    const creatorId = request.creator.id;

    // Get the offer
    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    // Create a trackable short link
    const { code } = await createOfferLink(creatorId, offerId, 'drop_link');

    // Build the chat message
    const discount = offer.type === 'percentage_off'
      ? `${offer.value}% off`
      : `$${(offer.value / 100).toFixed(2)} off`;

    const chatMessage = message
      ? `🔗 ${message}\n\nunifyed.link/${code}`
      : `🔗 Get ${offer.name} - ${discount}\n\nunifyed.link/${code}`;

    // Send to all platforms
    try {
      await chatService.sendMessage(creatorId, chatMessage);
    } catch {
      // Chat might not be active
    }

    return reply.send({
      success: true,
      link: {
        code,
        url: `unifyed.link/${code}`,
      },
      message: chatMessage,
    });
  });

  /**
   * POST /chat-commerce/flash-sale
   * Start a flash sale and announce it to chat
   */
  fastify.post('/flash-sale', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const { offerId, durationMinutes, additionalDiscount, message } = flashSaleSchema.parse(request.body);
    const creatorId = request.creator.id;

    // Get the offer
    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    // Calculate flash sale end time
    const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    // Create flash sale record
    const [flashSale] = await fastify.db
      .insert(flashSales)
      .values({
        creatorId,
        offerId,
        originalDiscount: offer.value,
        flashDiscount: additionalDiscount
          ? offer.value + additionalDiscount
          : offer.value,
        startsAt: new Date(),
        endsAt,
        status: 'active',
      })
      .returning();

    if (!flashSale) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create flash sale');
    }

    // Create a trackable short link
    const { code } = await createOfferLink(creatorId, offerId, 'flash_sale');

    // Build the announcement message
    const totalDiscount = additionalDiscount
      ? `${offer.value + additionalDiscount}%`
      : `${offer.value}%`;

    const chatMessage = message
      ? `⚡ FLASH SALE! ${message}\n\n${offer.name} - ${totalDiscount} OFF!\n⏰ Ends in ${durationMinutes} minutes!\n🔗 unifyed.link/${code}`
      : `⚡ FLASH SALE! ${offer.name}\n\n💰 ${totalDiscount} OFF - LIMITED TIME!\n⏰ Ends in ${durationMinutes} minutes!\n🔗 unifyed.link/${code}`;

    // Send to all platforms
    try {
      await chatService.sendMessage(creatorId, chatMessage);
    } catch {
      // Chat might not be active
    }

    // Schedule end announcement (in production, use a proper job queue)
    const flashSaleId = flashSale.id;
    const offerName = offer.name;
    setTimeout(async () => {
      try {
        // Update flash sale status
        await fastify.db
          .update(flashSales)
          .set({ status: 'ended' })
          .where(eq(flashSales.id, flashSaleId));

        // Announce end
        try {
          await chatService.sendMessage(
            creatorId,
            `⏰ Flash sale ended! ${offerName} is back to regular price. Thanks to everyone who grabbed this deal!`
          );
        } catch {
          // Chat might not be active
        }
      } catch (error) {
        console.error('Error ending flash sale:', error);
      }
    }, durationMinutes * 60 * 1000);

    return reply.send({
      success: true,
      flashSale: {
        id: flashSale.id,
        offerId: offer.id,
        offerName: offer.name,
        discount: totalDiscount,
        endsAt: endsAt.toISOString(),
        durationMinutes,
      },
      link: {
        code,
        url: `unifyed.link/${code}`,
      },
      message: chatMessage,
    });
  });

  /**
   * POST /chat-commerce/end-flash-sale
   * Manually end a flash sale
   */
  fastify.post('/end-flash-sale', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const { flashSaleId } = endFlashSaleSchema.parse(request.body);
    const creatorId = request.creator.id;

    // Get the flash sale
    const [flashSale] = await fastify.db
      .select()
      .from(flashSales)
      .where(and(
        eq(flashSales.id, flashSaleId),
        eq(flashSales.creatorId, creatorId),
        eq(flashSales.status, 'active')
      ))
      .limit(1);

    if (!flashSale) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Active flash sale not found');
    }

    // Get the offer name
    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(eq(offers.id, flashSale.offerId))
      .limit(1);

    // End the flash sale
    await fastify.db
      .update(flashSales)
      .set({ status: 'ended', endsAt: new Date() })
      .where(eq(flashSales.id, flashSaleId));

    // Announce end
    try {
      await chatService.sendMessage(
        creatorId,
        `⏰ Flash sale ended! ${offer?.name || 'The deal'} is back to regular price. Thanks to everyone who grabbed this deal!`
      );
    } catch {
      // Chat might not be active
    }

    return reply.send({
      success: true,
      message: 'Flash sale ended',
    });
  });

  /**
   * GET /chat-commerce/active-flash-sales
   * Get all active flash sales
   */
  fastify.get('/active-flash-sales', async (request, reply) => {
    const creatorId = request.creator.id;

    const activeFlashSales = await fastify.db
      .select({
        id: flashSales.id,
        offerId: flashSales.offerId,
        flashDiscount: flashSales.flashDiscount,
        startsAt: flashSales.startsAt,
        endsAt: flashSales.endsAt,
        offerName: offers.name,
      })
      .from(flashSales)
      .innerJoin(offers, eq(flashSales.offerId, offers.id))
      .where(and(
        eq(flashSales.creatorId, creatorId),
        eq(flashSales.status, 'active'),
        gte(flashSales.endsAt, new Date())
      ));

    return reply.send({
      flashSales: activeFlashSales.map((sale) => ({
        id: sale.id,
        offerId: sale.offerId,
        offerName: sale.offerName,
        discount: `${sale.flashDiscount}%`,
        startsAt: sale.startsAt,
        endsAt: sale.endsAt,
        timeRemaining: Math.max(0, Math.floor((sale.endsAt.getTime() - Date.now()) / 1000)),
      })),
    });
  });

  /**
   * POST /chat-commerce/quick-message
   * Send a quick pre-set message to chat
   */
  fastify.post('/quick-message', async (request, reply) => {
    const chatService = getChatService();
    if (!chatService) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Chat service not initialized');
    }

    const { message } = sendQuickMessageSchema.parse(request.body);
    const creatorId = request.creator.id;

    try {
      await chatService.sendMessage(creatorId, message);
    } catch (error) {
      throw new AppError(
        ErrorCodes.INTEGRATION_ERROR,
        error instanceof Error ? error.message : 'Failed to send message'
      );
    }

    return reply.send({
      success: true,
      message: 'Message sent',
    });
  });
}
