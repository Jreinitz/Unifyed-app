import { FastifyInstance } from 'fastify';
import { eq, and, count, sql } from 'drizzle-orm';
import { offers, offerProducts, products, platformConnections } from '@unifyed/db/schema';
import { 
  listOffersQuerySchema,
  getOfferParamsSchema,
  createOfferRequestSchema,
  updateOfferParamsSchema,
  updateOfferRequestSchema,
  activateOfferParamsSchema,
  deactivateOfferParamsSchema,
  deleteOfferParamsSchema,
  type ListOffersResponse,
  type GetOfferResponse,
  type CreateOfferResponse,
  type UpdateOfferResponse,
  type ActivateOfferResponse,
  type DeactivateOfferResponse,
  type DeleteOfferResponse,
} from '@unifyed/types/api';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import { authPlugin } from '../plugins/auth.js';

export async function offersRoutes(fastify: FastifyInstance) {
  await fastify.register(authPlugin);
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /offers - List offers
  fastify.get('/', async (request, reply) => {
    const query = listOffersQuerySchema.parse(request.query);
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(offers.creatorId, request.creator.id)];
    if (status) {
      conditions.push(eq(offers.status, status));
    }

    const [countResult] = await fastify.db
      .select({ count: count() })
      .from(offers)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const offerList = await fastify.db
      .select()
      .from(offers)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(offers.createdAt);

    const response: ListOffersResponse = {
      offers: offerList.map(o => ({
        ...o,
        metadata: o.metadata as Record<string, unknown> | null,
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

  // GET /offers/:id - Get single offer with products
  fastify.get('/:id', async (request, reply) => {
    const { id } = getOfferParamsSchema.parse(request.params);

    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, id), eq(offers.creatorId, request.creator.id)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    const offerProductsList = await fastify.db
      .select()
      .from(offerProducts)
      .where(eq(offerProducts.offerId, id));

    const response: GetOfferResponse = {
      offer: {
        ...offer,
        metadata: offer.metadata as Record<string, unknown> | null,
        products: offerProductsList,
      },
    };

    return reply.send(response);
  });

  // POST /offers - Create offer
  fastify.post('/', async (request, reply) => {
    const input = createOfferRequestSchema.parse(request.body);

    // Verify all products belong to creator
    const validProducts = await fastify.db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          sql`${products.id} IN ${input.productIds}`,
          sql`${products.connectionId} IN (
            SELECT id FROM ${platformConnections}
            WHERE creator_id = ${request.creator.id}
          )`
        )
      );

    if (validProducts.length !== input.productIds.length) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Some products not found or not owned by creator');
    }

    // Create offer
    const [offer] = await fastify.db
      .insert(offers)
      .values({
        creatorId: request.creator.id,
        name: input.name,
        description: input.description,
        type: input.type,
        value: input.value,
        status: 'draft',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        maxRedemptions: input.maxRedemptions,
        maxPerCustomer: input.maxPerCustomer,
        badgeText: input.badgeText,
      })
      .returning();

    if (!offer) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create offer');
    }

    // Create offer products
    const offerProductsData = input.productIds.map((productId, index) => ({
      offerId: offer.id,
      productId,
      sortOrder: index,
    }));

    await fastify.db.insert(offerProducts).values(offerProductsData);

    const createdOfferProducts = await fastify.db
      .select()
      .from(offerProducts)
      .where(eq(offerProducts.offerId, offer.id));

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.OFFER_CREATED, {
      offerId: offer.id,
      name: offer.name,
      type: offer.type,
      value: offer.value,
      productCount: input.productIds.length,
    }, { creatorId: request.creator.id });

    const response: CreateOfferResponse = {
      offer: {
        ...offer,
        metadata: offer.metadata as Record<string, unknown> | null,
        products: createdOfferProducts,
      },
    };

    return reply.status(201).send(response);
  });

  // PATCH /offers/:id - Update offer
  fastify.patch('/:id', async (request, reply) => {
    const { id } = updateOfferParamsSchema.parse(request.params);
    const input = updateOfferRequestSchema.parse(request.body);

    const [existing] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, id), eq(offers.creatorId, request.creator.id)))
      .limit(1);

    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    const [updated] = await fastify.db
      .update(offers)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(offers.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to update offer');
    }

    const offerProductsList = await fastify.db
      .select()
      .from(offerProducts)
      .where(eq(offerProducts.offerId, id));

    const response: UpdateOfferResponse = {
      offer: {
        ...updated,
        metadata: updated.metadata as Record<string, unknown> | null,
        products: offerProductsList,
      },
    };

    return reply.send(response);
  });

  // POST /offers/:id/activate - Activate offer
  fastify.post('/:id/activate', async (request, reply) => {
    const { id } = activateOfferParamsSchema.parse(request.params);

    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, id), eq(offers.creatorId, request.creator.id)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    if (offer.status === 'active') {
      throw new AppError(ErrorCodes.CONFLICT, 'Offer is already active');
    }

    const [updated] = await fastify.db
      .update(offers)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(offers.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to activate offer');
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.OFFER_ACTIVATED, {
      offerId: updated.id,
      name: updated.name,
      activatedAt: new Date(),
    }, { creatorId: request.creator.id });

    const response: ActivateOfferResponse = {
      offer: {
        ...updated,
        metadata: updated.metadata as Record<string, unknown> | null,
      },
    };

    return reply.send(response);
  });

  // POST /offers/:id/deactivate - Deactivate offer
  fastify.post('/:id/deactivate', async (request, reply) => {
    const { id } = deactivateOfferParamsSchema.parse(request.params);

    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, id), eq(offers.creatorId, request.creator.id)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    const [updated] = await fastify.db
      .update(offers)
      .set({
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(offers.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to deactivate offer');
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.OFFER_DEACTIVATED, {
      offerId: updated.id,
      name: updated.name,
      reason: 'manual',
    }, { creatorId: request.creator.id });

    const response: DeactivateOfferResponse = {
      offer: {
        ...updated,
        metadata: updated.metadata as Record<string, unknown> | null,
      },
    };

    return reply.send(response);
  });

  // DELETE /offers/:id - Delete offer
  fastify.delete('/:id', async (request, reply) => {
    const { id } = deleteOfferParamsSchema.parse(request.params);

    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, id), eq(offers.creatorId, request.creator.id)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    await fastify.db.delete(offers).where(eq(offers.id, id));

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.OFFER_DELETED, {
      offerId: id,
      name: offer.name,
    }, { creatorId: request.creator.id });

    const response: DeleteOfferResponse = { success: true };
    return reply.send(response);
  });
}
