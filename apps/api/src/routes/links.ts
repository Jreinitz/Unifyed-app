import { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { shortLinks, offers, attributionContexts } from '@unifyed/db/schema';
import { 
  listLinksQuerySchema,
  getLinkParamsSchema,
  createLinkRequestSchema,
  revokeLinkParamsSchema,
  type ListLinksResponse,
  type GetLinkResponse,
  type CreateLinkResponse,
  type RevokeLinkResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes, generateShortLinkCode } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import { authPlugin } from '../plugins/auth.js';
import { env } from '../config/env.js';

export async function linksRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /links - List short links
  fastify.get('/', async (request, reply) => {
    const query = listLinksQuerySchema.parse(request.query);
    const { page, limit, offerId } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(shortLinks.creatorId, request.creator.id)];
    if (offerId) {
      conditions.push(eq(shortLinks.offerId, offerId));
    }

    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(shortLinks)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const linkList = await fastify.db
      .select()
      .from(shortLinks)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(shortLinks.createdAt);

    const response: ListLinksResponse = {
      links: linkList.map(l => ({
        ...l,
        metadata: l.metadata as Record<string, unknown> | null,
      })),
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };

    return reply.send(response);
  });

  // GET /links/:id - Get single link
  fastify.get('/:id', async (request, reply) => {
    const { id } = getLinkParamsSchema.parse(request.params);

    const [link] = await fastify.db
      .select()
      .from(shortLinks)
      .where(and(eq(shortLinks.id, id), eq(shortLinks.creatorId, request.creator.id)))
      .limit(1);

    if (!link) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Link not found');
    }

    const response: GetLinkResponse = {
      link: {
        ...link,
        metadata: link.metadata as Record<string, unknown> | null,
      },
    };

    return reply.send(response);
  });

  // POST /links - Create short link
  fastify.post('/', async (request, reply) => {
    const input = createLinkRequestSchema.parse(request.body);

    // Verify offer belongs to creator and is active
    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, input.offerId), eq(offers.creatorId, request.creator.id)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    // Create attribution context
    const [attrContext] = await fastify.db
      .insert(attributionContexts)
      .values({
        creatorId: request.creator.id,
        platform: input.platform,
        surface: input.surface,
        streamId: input.streamId,
        replayId: input.replayId,
        momentId: input.momentId,
      })
      .returning();

    if (!attrContext) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create attribution context');
    }

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
    const [link] = await fastify.db
      .insert(shortLinks)
      .values({
        creatorId: request.creator.id,
        code,
        offerId: input.offerId,
        attributionContextId: attrContext.id,
        name: input.name,
        expiresAt: input.expiresAt,
        maxClicks: input.maxClicks,
      })
      .returning();

    if (!link) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create link');
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.LINK_CREATED, {
      linkId: link.id,
      code: link.code,
      offerId: link.offerId,
      surface: input.surface,
    }, { creatorId: request.creator.id });

    const response: CreateLinkResponse = {
      link: {
        ...link,
        metadata: link.metadata as Record<string, unknown> | null,
      },
      url: `${env.API_URL}/go/${link.code}`,
    };

    return reply.status(201).send(response);
  });

  // DELETE /links/:id - Revoke link
  fastify.delete('/:id', async (request, reply) => {
    const { id } = revokeLinkParamsSchema.parse(request.params);

    const [link] = await fastify.db
      .select()
      .from(shortLinks)
      .where(and(eq(shortLinks.id, id), eq(shortLinks.creatorId, request.creator.id)))
      .limit(1);

    if (!link) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Link not found');
    }

    const [updated] = await fastify.db
      .update(shortLinks)
      .set({
        isRevoked: true,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shortLinks.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to revoke link');
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.LINK_REVOKED, {
      linkId: updated.id,
      code: updated.code,
    }, { creatorId: request.creator.id });

    const response: RevokeLinkResponse = {
      link: {
        ...updated,
        metadata: updated.metadata as Record<string, unknown> | null,
      },
    };

    return reply.send(response);
  });
}
