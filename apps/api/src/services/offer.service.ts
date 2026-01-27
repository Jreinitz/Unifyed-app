import { eq, and, count, sql } from 'drizzle-orm';
import type { Database } from '@unifyed/db';
import { offers, offerProducts, products, platformConnections } from '@unifyed/db/schema';
import { AppError, ErrorCodes } from '@unifyed/utils';

export interface CreateOfferInput {
  name: string;
  description?: string;
  type: 'percentage_off' | 'fixed_amount_off' | 'fixed_price' | 'bundle';
  value: number;
  productIds: string[];
  startsAt?: Date;
  endsAt?: Date;
  maxRedemptions?: number;
  maxPerCustomer?: number;
  badgeText?: string;
}

export interface UpdateOfferInput {
  name?: string;
  description?: string;
  type?: 'percentage_off' | 'fixed_amount_off' | 'fixed_price' | 'bundle';
  value?: number;
  startsAt?: Date;
  endsAt?: Date;
  maxRedemptions?: number;
  maxPerCustomer?: number;
  badgeText?: string;
}

export class OfferService {
  constructor(private db: Database) {}

  /**
   * List offers for a creator with pagination
   */
  async list(
    creatorId: string,
    options: { page: number; limit: number; status?: string }
  ) {
    const { page, limit, status } = options;
    const offset = (page - 1) * limit;

    const conditions = [eq(offers.creatorId, creatorId)];
    if (status) {
      conditions.push(eq(offers.status, status as typeof offers.status.enumValues[number]));
    }

    const [countResult] = await this.db
      .select({ count: count() })
      .from(offers)
      .where(and(...conditions));

    const total = countResult?.count ?? 0;

    const offerList = await this.db
      .select()
      .from(offers)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(offers.createdAt);

    return {
      offers: offerList,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  /**
   * Get a single offer with its products
   */
  async get(creatorId: string, offerId: string) {
    const [offer] = await this.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    const offerProductsList = await this.db
      .select()
      .from(offerProducts)
      .where(eq(offerProducts.offerId, offerId));

    return {
      ...offer,
      products: offerProductsList,
    };
  }

  /**
   * Create a new offer with products
   */
  async create(creatorId: string, input: CreateOfferInput) {
    // Verify all products belong to creator
    const validProducts = await this.db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          sql`${products.id} IN ${input.productIds}`,
          sql`${products.connectionId} IN (
            SELECT id FROM ${platformConnections}
            WHERE creator_id = ${creatorId}
          )`
        )
      );

    if (validProducts.length !== input.productIds.length) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Some products not found or not owned by creator'
      );
    }

    // Create offer
    const [offer] = await this.db
      .insert(offers)
      .values({
        creatorId,
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

    await this.db.insert(offerProducts).values(offerProductsData);

    const createdProducts = await this.db
      .select()
      .from(offerProducts)
      .where(eq(offerProducts.offerId, offer.id));

    return {
      ...offer,
      products: createdProducts,
    };
  }

  /**
   * Update an existing offer
   */
  async update(creatorId: string, offerId: string, input: UpdateOfferInput) {
    const [existing] = await this.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    const [updated] = await this.db
      .update(offers)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(offers.id, offerId))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to update offer');
    }

    const offerProductsList = await this.db
      .select()
      .from(offerProducts)
      .where(eq(offerProducts.offerId, offerId));

    return {
      ...updated,
      products: offerProductsList,
    };
  }

  /**
   * Activate an offer
   */
  async activate(creatorId: string, offerId: string) {
    const [offer] = await this.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    if (offer.status === 'active') {
      throw new AppError(ErrorCodes.CONFLICT, 'Offer is already active');
    }

    const [updated] = await this.db
      .update(offers)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(offers.id, offerId))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to activate offer');
    }

    return updated;
  }

  /**
   * Deactivate (pause) an offer
   */
  async deactivate(creatorId: string, offerId: string) {
    const [offer] = await this.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    const [updated] = await this.db
      .update(offers)
      .set({
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(offers.id, offerId))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to deactivate offer');
    }

    return updated;
  }

  /**
   * Delete an offer
   */
  async delete(creatorId: string, offerId: string) {
    const [offer] = await this.db
      .select()
      .from(offers)
      .where(and(eq(offers.id, offerId), eq(offers.creatorId, creatorId)))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    await this.db.delete(offers).where(eq(offers.id, offerId));

    return { name: offer.name };
  }
}
