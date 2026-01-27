import { eq, and, gt, sql } from 'drizzle-orm';
import type { Database } from '@unifyed/db';
import {
  shortLinks,
  offers,
  offerProducts,
  products,
  variants,
  checkoutSessions,
  reservations,
  platformConnections,
} from '@unifyed/db/schema';
import { AppError, ErrorCodes, generateIdempotencyKey, decrypt } from '@unifyed/utils';

const CHECKOUT_SESSION_TTL_MINUTES = 30;
const RESERVATION_TTL_MINUTES = 15;

export interface CheckoutStartInput {
  code: string;
  variantId?: string;
  quantity: number;
  visitorId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface CheckoutResult {
  checkoutSession: typeof checkoutSessions.$inferSelect;
  checkoutUrl: string;
  isExisting: boolean;
}

export class CheckoutService {
  constructor(
    private db: Database,
    private credentialsEncryptionKey: string
  ) {}

  /**
   * Start a checkout session from a short link
   */
  async startCheckout(input: CheckoutStartInput): Promise<CheckoutResult> {
    const { code, quantity, userAgent, ipAddress } = input;

    // Find short link
    const [link] = await this.db
      .select()
      .from(shortLinks)
      .where(eq(shortLinks.code, code))
      .limit(1);

    if (!link) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Link not found');
    }

    // Validate link
    this.validateLink(link);

    // Get and validate offer
    const offer = await this.getAndValidateOffer(link.offerId);

    // Get offer products and variants
    const offerProductsList = await this.getOfferProducts(offer.id);

    if (offerProductsList.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No products in offer');
    }

    // Select variant
    const selectedVariant = this.selectVariant(offerProductsList, input.variantId);

    // Check inventory
    if (selectedVariant.variant.inventoryQuantity < quantity) {
      throw new AppError(ErrorCodes.INSUFFICIENT_INVENTORY, 'Not enough inventory');
    }

    // Get connection
    const connection = await this.getConnection(selectedVariant.product.connectionId);

    // Calculate prices
    const prices = this.calculatePrices(selectedVariant.variant.price, offer, quantity);

    // Generate idempotency key
    const visitorId = input.visitorId ?? generateIdempotencyKey();
    const idempotencyKey = `${visitorId}:${link.code}:${selectedVariant.variant.id}`;

    // Check for existing checkout session
    const existingSession = await this.findExistingSession(idempotencyKey);
    if (existingSession?.externalCheckoutUrl) {
      return {
        checkoutSession: existingSession,
        checkoutUrl: existingSession.externalCheckoutUrl,
        isExisting: true,
      };
    }

    // Create checkout session and reservation
    const checkoutSession = await this.createCheckoutSession({
      creatorId: offer.creatorId,
      idempotencyKey,
      shortLinkId: link.id,
      attributionContextId: link.attributionContextId,
      offerId: offer.id,
      connectionId: connection.id,
      variant: selectedVariant.variant,
      quantity,
      prices,
      visitorId,
      userAgent,
      ipAddress,
    });

    // Update link click count
    await this.db
      .update(shortLinks)
      .set({
        clickCount: sql`${shortLinks.clickCount} + 1`,
        lastClickedAt: new Date(),
      })
      .where(eq(shortLinks.id, link.id));

    // Build checkout URL
    const checkoutUrl = await this.buildCheckoutUrl(
      connection,
      selectedVariant.variant.externalId,
      quantity,
      checkoutSession.id
    );

    // Update session with checkout URL
    await this.db
      .update(checkoutSessions)
      .set({
        externalCheckoutUrl: checkoutUrl,
        status: 'redirected',
        redirectedAt: new Date(),
      })
      .where(eq(checkoutSessions.id, checkoutSession.id));

    return {
      checkoutSession,
      checkoutUrl,
      isExisting: false,
    };
  }

  private validateLink(link: typeof shortLinks.$inferSelect) {
    if (link.isRevoked) {
      throw new AppError(ErrorCodes.LINK_REVOKED, 'Link has been revoked');
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new AppError(ErrorCodes.LINK_EXPIRED, 'Link has expired');
    }

    if (link.maxClicks && link.clickCount >= link.maxClicks) {
      throw new AppError(ErrorCodes.LINK_EXPIRED, 'Link has reached maximum clicks');
    }
  }

  private async getAndValidateOffer(offerId: string) {
    const [offer] = await this.db
      .select()
      .from(offers)
      .where(eq(offers.id, offerId))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    if (offer.status !== 'active') {
      throw new AppError(ErrorCodes.OFFER_NOT_ACTIVE, 'Offer is not active');
    }

    if (offer.startsAt && offer.startsAt > new Date()) {
      throw new AppError(ErrorCodes.OFFER_NOT_ACTIVE, 'Offer has not started yet');
    }

    if (offer.endsAt && offer.endsAt < new Date()) {
      throw new AppError(ErrorCodes.OFFER_EXPIRED, 'Offer has expired');
    }

    return offer;
  }

  private async getOfferProducts(offerId: string) {
    return this.db
      .select({
        offerProduct: offerProducts,
        product: products,
        variant: variants,
      })
      .from(offerProducts)
      .innerJoin(products, eq(products.id, offerProducts.productId))
      .innerJoin(variants, eq(variants.productId, products.id))
      .where(eq(offerProducts.offerId, offerId));
  }

  private selectVariant(
    offerProductsList: Array<{
      offerProduct: typeof offerProducts.$inferSelect;
      product: typeof products.$inferSelect;
      variant: typeof variants.$inferSelect;
    }>,
    requestedVariantId?: string
  ) {
    let selectedVariant = offerProductsList[0];

    if (requestedVariantId) {
      const found = offerProductsList.find(op => op.variant.id === requestedVariantId);
      if (found) {
        selectedVariant = found;
      }
    }

    if (!selectedVariant) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No variant available');
    }

    return selectedVariant;
  }

  private async getConnection(connectionId: string) {
    const [connection] = await this.db
      .select()
      .from(platformConnections)
      .where(eq(platformConnections.id, connectionId))
      .limit(1);

    if (!connection || connection.platform !== 'shopify') {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Shopify connection not found');
    }

    return connection;
  }

  private calculatePrices(
    originalPrice: number,
    offer: typeof offers.$inferSelect,
    quantity: number
  ) {
    let discountedPrice = originalPrice;

    switch (offer.type) {
      case 'percentage_off':
        discountedPrice = Math.round(originalPrice * (1 - offer.value / 100));
        break;
      case 'fixed_amount_off':
        discountedPrice = Math.max(0, originalPrice - offer.value);
        break;
      case 'fixed_price':
        discountedPrice = offer.value;
        break;
    }

    return {
      originalPrice,
      discountedPrice,
      subtotal: originalPrice * quantity,
      discount: (originalPrice - discountedPrice) * quantity,
      total: discountedPrice * quantity,
    };
  }

  private async findExistingSession(idempotencyKey: string) {
    const [existing] = await this.db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.idempotencyKey, idempotencyKey),
          gt(checkoutSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    return existing;
  }

  private async createCheckoutSession(input: {
    creatorId: string;
    idempotencyKey: string;
    shortLinkId: string;
    attributionContextId: string;
    offerId: string;
    connectionId: string;
    variant: typeof variants.$inferSelect;
    quantity: number;
    prices: ReturnType<CheckoutService['calculatePrices']>;
    visitorId: string;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
  }) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + CHECKOUT_SESSION_TTL_MINUTES);

    const reservationExpiresAt = new Date();
    reservationExpiresAt.setMinutes(reservationExpiresAt.getMinutes() + RESERVATION_TTL_MINUTES);

    const [session] = await this.db.transaction(async (tx) => {
      // Create checkout session
      const [session] = await tx
        .insert(checkoutSessions)
        .values({
          creatorId: input.creatorId,
          idempotencyKey: input.idempotencyKey,
          shortLinkId: input.shortLinkId,
          attributionContextId: input.attributionContextId,
          offerId: input.offerId,
          connectionId: input.connectionId,
          status: 'pending',
          cartItems: [
            {
              variantId: input.variant.id,
              quantity: input.quantity,
              price: input.prices.originalPrice,
              offerPrice: input.prices.discountedPrice,
            },
          ],
          subtotal: input.prices.subtotal,
          discount: input.prices.discount,
          total: input.prices.total,
          currency: input.variant.currency,
          visitorId: input.visitorId,
          userAgent: input.userAgent,
          ipAddress: input.ipAddress,
          expiresAt,
        })
        .returning();

      if (!session) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create checkout session');
      }

      // Create reservation
      await tx.insert(reservations).values({
        variantId: input.variant.id,
        checkoutSessionId: session.id,
        quantity: input.quantity,
        status: 'pending',
        expiresAt: reservationExpiresAt,
      });

      return [session];
    });

    return session!;
  }

  private async buildCheckoutUrl(
    connection: typeof platformConnections.$inferSelect,
    variantExternalId: string,
    quantity: number,
    checkoutSessionId: string
  ) {
    const credentials = JSON.parse(
      decrypt(connection.credentials, this.credentialsEncryptionKey)
    ) as { shopDomain: string };

    return `https://${credentials.shopDomain}.myshopify.com/cart/${variantExternalId}:${quantity}?checkout[note]=${checkoutSessionId}`;
  }
}
