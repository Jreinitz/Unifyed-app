import { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { 
  replays, 
  moments, 
  creators, 
  offers, 
  offerProducts, 
  products, 
  variants,
  shortLinks,
  attributionContexts,
} from '@unifyed/db/schema';
import { 
  getPublicReplayParamsSchema,
  getPublicCreatorParamsSchema,
  emitPublicEventRequestSchema,
  type PublicReplayResponse,
  type PublicCreatorResponse,
  type EmitPublicEventResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes, generateShortLinkCode } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import { env } from '../config/env.js';

export async function publicRoutes(fastify: FastifyInstance) {
  // GET /public/replays/:idOrSlug - Get published replay with moments and offers
  fastify.get('/replays/:idOrSlug', async (request, reply) => {
    const { idOrSlug } = getPublicReplayParamsSchema.parse(request.params);

    // Find replay by ID or slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    
    const [replay] = await fastify.db
      .select()
      .from(replays)
      .where(
        and(
          isUuid 
            ? eq(replays.id, idOrSlug) 
            : eq(replays.slug, idOrSlug),
          eq(replays.isPublished, true)
        )
      )
      .limit(1);

    if (!replay) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Replay not found');
    }

    // Get creator info
    const [creator] = await fastify.db
      .select({
        name: creators.name,
        handle: creators.handle,
        avatarUrl: creators.avatarUrl,
      })
      .from(creators)
      .where(eq(creators.id, replay.creatorId))
      .limit(1);

    if (!creator) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Creator not found');
    }

    // Get moments
    const replayMoments = await fastify.db
      .select({
        id: moments.id,
        title: moments.title,
        description: moments.description,
        timestamp: moments.timestamp,
        thumbnailUrl: moments.thumbnailUrl,
      })
      .from(moments)
      .where(eq(moments.replayId, replay.id))
      .orderBy(moments.timestamp);

    // Get active offers for this creator with products and short links
    const activeOffers = await fastify.db
      .select({
        offer: offers,
        offerProduct: offerProducts,
        product: products,
        variant: variants,
      })
      .from(offers)
      .innerJoin(offerProducts, eq(offerProducts.offerId, offers.id))
      .innerJoin(products, eq(products.id, offerProducts.productId))
      .innerJoin(variants, eq(variants.productId, products.id))
      .where(
        and(
          eq(offers.creatorId, replay.creatorId),
          eq(offers.status, 'active')
        )
      );

    // Group offers with their products and create short links
    const offersMap = new Map<string, {
      offer: typeof offers.$inferSelect;
      products: Array<{
        id: string;
        title: string;
        imageUrl: string | null;
        originalPrice: number;
        offerPrice: number;
        currency: string;
        shortLinkCode: string;
        shortLinkUrl: string;
      }>;
    }>();

    for (const row of activeOffers) {
      if (!offersMap.has(row.offer.id)) {
        offersMap.set(row.offer.id, {
          offer: row.offer,
          products: [],
        });
      }

      // Calculate offer price
      let offerPrice = row.variant.price;
      switch (row.offer.type) {
        case 'percentage_off':
          offerPrice = Math.round(row.variant.price * (1 - row.offer.value / 100));
          break;
        case 'fixed_amount_off':
          offerPrice = Math.max(0, row.variant.price - row.offer.value);
          break;
        case 'fixed_price':
          offerPrice = row.offer.value;
          break;
      }

      // Find or create short link for this offer with replay attribution
      let [existingLink] = await fastify.db
        .select()
        .from(shortLinks)
        .innerJoin(attributionContexts, eq(attributionContexts.id, shortLinks.attributionContextId))
        .where(
          and(
            eq(shortLinks.offerId, row.offer.id),
            eq(shortLinks.creatorId, replay.creatorId),
            eq(attributionContexts.replayId, replay.id),
            eq(shortLinks.isRevoked, false)
          )
        )
        .limit(1);

      let shortLinkCode: string;
      
      if (existingLink) {
        shortLinkCode = existingLink.short_links.code;
      } else {
        // Create attribution context for replay
        const [attrContext] = await fastify.db
          .insert(attributionContexts)
          .values({
            creatorId: replay.creatorId,
            platform: replay.platform,
            surface: 'replay',
            replayId: replay.id,
          })
          .returning();

        // Generate unique code
        let code = generateShortLinkCode();
        let attempts = 0;
        while (attempts < 5) {
          const existing = await fastify.db
            .select({ id: shortLinks.id })
            .from(shortLinks)
            .where(eq(shortLinks.code, code))
            .limit(1);
          
          if (existing.length === 0) break;
          code = generateShortLinkCode();
          attempts++;
        }

        // Create short link
        await fastify.db
          .insert(shortLinks)
          .values({
            creatorId: replay.creatorId,
            code,
            offerId: row.offer.id,
            attributionContextId: attrContext!.id,
            name: `Replay: ${replay.title} - ${row.offer.name}`,
          });

        shortLinkCode = code;
      }

      const entry = offersMap.get(row.offer.id)!;
      // Avoid duplicate products (multiple variants)
      if (!entry.products.find(p => p.id === row.product.id)) {
        entry.products.push({
          id: row.product.id,
          title: row.product.title,
          imageUrl: row.product.imageUrl,
          originalPrice: row.variant.price,
          offerPrice,
          currency: row.variant.currency,
          shortLinkCode,
          shortLinkUrl: `${env.API_URL}/go/${shortLinkCode}`,
        });
      }
    }

    // Increment view count (async, don't block response)
    fastify.db
      .update(replays)
      .set({ viewCount: sql`${replays.viewCount} + 1` })
      .where(eq(replays.id, replay.id))
      .then(() => {})
      .catch((err) => fastify.log.error(err, 'Failed to increment view count'));

    const response: PublicReplayResponse = {
      replay: {
        id: replay.id,
        title: replay.title,
        description: replay.description,
        videoUrl: replay.videoUrl,
        thumbnailUrl: replay.thumbnailUrl,
        duration: replay.duration,
        slug: replay.slug,
        viewCount: replay.viewCount,
        platform: replay.platform,
        publishedAt: replay.publishedAt,
        creator: {
          name: creator.name,
          handle: creator.handle,
          avatarUrl: creator.avatarUrl,
        },
        moments: replayMoments,
        offers: Array.from(offersMap.values()).map(({ offer, products }) => ({
          id: offer.id,
          name: offer.name,
          description: offer.description,
          type: offer.type,
          value: offer.value,
          badgeText: offer.badgeText,
          products,
        })),
      },
    };

    return reply.send(response);
  });

  // GET /public/creators/:handle - Get creator profile with active offers
  fastify.get('/creators/:handle', async (request, reply) => {
    const { handle } = getPublicCreatorParamsSchema.parse(request.params);

    // Find creator by handle
    const [creator] = await fastify.db
      .select()
      .from(creators)
      .where(eq(creators.handle, handle.toLowerCase()))
      .limit(1);

    if (!creator) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Creator not found');
    }

    // Get active offers with products
    const activeOffers = await fastify.db
      .select({
        offer: offers,
        offerProduct: offerProducts,
        product: products,
        variant: variants,
      })
      .from(offers)
      .innerJoin(offerProducts, eq(offerProducts.offerId, offers.id))
      .innerJoin(products, eq(products.id, offerProducts.productId))
      .innerJoin(variants, eq(variants.productId, products.id))
      .where(
        and(
          eq(offers.creatorId, creator.id),
          eq(offers.status, 'active')
        )
      );

    // Group offers with products
    const offersMap = new Map<string, {
      offer: typeof offers.$inferSelect;
      products: Array<{
        id: string;
        title: string;
        imageUrl: string | null;
        originalPrice: number;
        offerPrice: number;
        currency: string;
      }>;
      shortLinkCode: string;
      shortLinkUrl: string;
    }>();

    for (const row of activeOffers) {
      if (!offersMap.has(row.offer.id)) {
        // Find or create short link for link-in-bio
        let [existingLink] = await fastify.db
          .select()
          .from(shortLinks)
          .innerJoin(attributionContexts, eq(attributionContexts.id, shortLinks.attributionContextId))
          .where(
            and(
              eq(shortLinks.offerId, row.offer.id),
              eq(shortLinks.creatorId, creator.id),
              eq(attributionContexts.surface, 'link_in_bio'),
              eq(shortLinks.isRevoked, false)
            )
          )
          .limit(1);

        let shortLinkCode: string;
        
        if (existingLink) {
          shortLinkCode = existingLink.short_links.code;
        } else {
          // Create attribution context for link-in-bio
          const [attrContext] = await fastify.db
            .insert(attributionContexts)
            .values({
              creatorId: creator.id,
              surface: 'link_in_bio',
            })
            .returning();

          // Generate unique code
          let code = generateShortLinkCode();
          let attempts = 0;
          while (attempts < 5) {
            const existing = await fastify.db
              .select({ id: shortLinks.id })
              .from(shortLinks)
              .where(eq(shortLinks.code, code))
              .limit(1);
            
            if (existing.length === 0) break;
            code = generateShortLinkCode();
            attempts++;
          }

          // Create short link
          await fastify.db
            .insert(shortLinks)
            .values({
              creatorId: creator.id,
              code,
              offerId: row.offer.id,
              attributionContextId: attrContext!.id,
              name: `Link in Bio: ${row.offer.name}`,
            });

          shortLinkCode = code;
        }

        offersMap.set(row.offer.id, {
          offer: row.offer,
          products: [],
          shortLinkCode,
          shortLinkUrl: `${env.API_URL}/go/${shortLinkCode}`,
        });
      }

      // Calculate offer price
      let offerPrice = row.variant.price;
      switch (row.offer.type) {
        case 'percentage_off':
          offerPrice = Math.round(row.variant.price * (1 - row.offer.value / 100));
          break;
        case 'fixed_amount_off':
          offerPrice = Math.max(0, row.variant.price - row.offer.value);
          break;
        case 'fixed_price':
          offerPrice = row.offer.value;
          break;
      }

      const entry = offersMap.get(row.offer.id)!;
      // Avoid duplicate products
      if (!entry.products.find(p => p.id === row.product.id)) {
        entry.products.push({
          id: row.product.id,
          title: row.product.title,
          imageUrl: row.product.imageUrl,
          originalPrice: row.variant.price,
          offerPrice,
          currency: row.variant.currency,
        });
      }
    }

    const response: PublicCreatorResponse = {
      creator: {
        name: creator.name,
        handle: creator.handle!,
        avatarUrl: creator.avatarUrl,
        bio: null, // Could add bio field to creators table later
        offers: Array.from(offersMap.values()).map(({ offer, products, shortLinkCode, shortLinkUrl }) => ({
          id: offer.id,
          name: offer.name,
          description: offer.description,
          badgeText: offer.badgeText,
          shortLinkCode,
          shortLinkUrl,
          products,
        })),
      },
    };

    return reply.send(response);
  });

  // POST /public/events - Emit client-side events (view, click tracking)
  fastify.post('/events', async (request, reply) => {
    const input = emitPublicEventRequestSchema.parse(request.body);
    const { eventType, payload } = input;

    // Generate visitor ID from request if not provided
    const visitorId = payload.visitorId ?? request.headers['x-visitor-id'] as string ?? null;
    const referrer = payload.referrer ?? request.headers.referer ?? null;

    let creatorId: string | undefined;

    // Determine creator ID based on event type
    if (eventType === 'REPLAY_VIEW' || eventType === 'REPLAY_CLICK') {
      if (!payload.replayId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'replayId is required for replay events');
      }

      const [replay] = await fastify.db
        .select({ creatorId: replays.creatorId })
        .from(replays)
        .where(eq(replays.id, payload.replayId))
        .limit(1);

      if (!replay) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Replay not found');
      }

      creatorId = replay.creatorId;
    } else if (eventType === 'LINK_IN_BIO_VIEW' || eventType === 'LINK_IN_BIO_CLICK') {
      if (!payload.handle && !payload.creatorId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'handle or creatorId is required for link-in-bio events');
      }

      if (payload.creatorId) {
        creatorId = payload.creatorId;
      } else if (payload.handle) {
        const [creator] = await fastify.db
          .select({ id: creators.id })
          .from(creators)
          .where(eq(creators.handle, payload.handle.toLowerCase()))
          .limit(1);

        if (!creator) {
          throw new AppError(ErrorCodes.NOT_FOUND, 'Creator not found');
        }

        creatorId = creator.id;
      }
    }

    // Emit the appropriate event
    let eventId: string | undefined;

    switch (eventType) {
      case 'REPLAY_VIEW':
        eventId = await fastify.emitEvent(EVENT_TYPES.REPLAY_VIEW, {
          replayId: payload.replayId!,
          visitorId,
          referrer,
        }, creatorId ? { creatorId } : {});
        break;

      case 'REPLAY_CLICK':
        if (!payload.shortLinkId) {
          throw new AppError(ErrorCodes.VALIDATION_ERROR, 'shortLinkId is required for REPLAY_CLICK');
        }
        eventId = await fastify.emitEvent(EVENT_TYPES.REPLAY_CLICK, {
          replayId: payload.replayId!,
          shortLinkId: payload.shortLinkId,
          momentId: payload.momentId ?? null,
          visitorId,
        }, creatorId ? { creatorId } : {});

        // Increment click count on replay
        await fastify.db
          .update(replays)
          .set({ clickCount: sql`${replays.clickCount} + 1` })
          .where(eq(replays.id, payload.replayId!));
        break;

      case 'LINK_IN_BIO_VIEW':
        if (!creatorId) {
          throw new AppError(ErrorCodes.VALIDATION_ERROR, 'creatorId is required for LINK_IN_BIO_VIEW');
        }
        eventId = await fastify.emitEvent(EVENT_TYPES.LINK_IN_BIO_VIEW, {
          creatorId,
          handle: payload.handle ?? '',
          visitorId,
          referrer,
        }, { creatorId });
        break;

      case 'LINK_IN_BIO_CLICK':
        if (!payload.shortLinkId) {
          throw new AppError(ErrorCodes.VALIDATION_ERROR, 'shortLinkId is required for LINK_IN_BIO_CLICK');
        }
        
        // Get offer ID from short link
        const [link] = await fastify.db
          .select({ offerId: shortLinks.offerId })
          .from(shortLinks)
          .where(eq(shortLinks.id, payload.shortLinkId))
          .limit(1);

        if (!creatorId) {
          throw new AppError(ErrorCodes.VALIDATION_ERROR, 'creatorId is required for LINK_IN_BIO_CLICK');
        }
        eventId = await fastify.emitEvent(EVENT_TYPES.LINK_IN_BIO_CLICK, {
          creatorId,
          shortLinkId: payload.shortLinkId,
          offerId: link?.offerId ?? payload.shortLinkId,
          visitorId,
        }, { creatorId });
        break;
    }

    const response: EmitPublicEventResponse = {
      success: true,
      eventId,
    };

    return reply.send(response);
  });
}
