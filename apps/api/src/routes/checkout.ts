import { FastifyInstance } from 'fastify';
import { eq, and, gt, sql } from 'drizzle-orm';
import { 
  shortLinks, 
  offers, 
  offerProducts, 
  variants, 
  products,
  checkoutSessions, 
  reservations,
  platformConnections,
} from '@unifyed/db/schema';
import { resolveShortLinkParamsSchema, resolveShortLinkQuerySchema } from '@unifyed/types/api';
import { AppError, ErrorCodes, generateIdempotencyKey, decrypt } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import { env } from '../config/env.js';

const CHECKOUT_SESSION_TTL_MINUTES = 30;
const RESERVATION_TTL_MINUTES = 15;

export async function checkoutRoutes(fastify: FastifyInstance) {
  // GET /go/:code - Resolve short link and start checkout (public)
  fastify.get('/:code', async (request, reply) => {
    const { code } = resolveShortLinkParamsSchema.parse(request.params);
    const query = resolveShortLinkQuerySchema.parse(request.query);

    // Find short link
    const [link] = await fastify.db
      .select()
      .from(shortLinks)
      .where(eq(shortLinks.code, code))
      .limit(1);

    if (!link) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Link not found');
    }

    // Check if revoked
    if (link.isRevoked) {
      throw new AppError(ErrorCodes.LINK_REVOKED, 'Link has been revoked');
    }

    // Check if expired
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new AppError(ErrorCodes.LINK_EXPIRED, 'Link has expired');
    }

    // Check click limit
    if (link.maxClicks && link.clickCount >= link.maxClicks) {
      throw new AppError(ErrorCodes.LINK_EXPIRED, 'Link has reached maximum clicks');
    }

    // Get offer and verify it's active
    const [offer] = await fastify.db
      .select()
      .from(offers)
      .where(eq(offers.id, link.offerId))
      .limit(1);

    if (!offer) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Offer not found');
    }

    if (offer.status !== 'active') {
      throw new AppError(ErrorCodes.OFFER_NOT_ACTIVE, 'Offer is not active');
    }

    // Check offer time bounds
    if (offer.startsAt && offer.startsAt > new Date()) {
      throw new AppError(ErrorCodes.OFFER_NOT_ACTIVE, 'Offer has not started yet');
    }

    if (offer.endsAt && offer.endsAt < new Date()) {
      throw new AppError(ErrorCodes.OFFER_EXPIRED, 'Offer has expired');
    }

    // Get offer products and variants
    const offerProductsList = await fastify.db
      .select({
        offerProduct: offerProducts,
        product: products,
        variant: variants,
      })
      .from(offerProducts)
      .innerJoin(products, eq(products.id, offerProducts.productId))
      .innerJoin(variants, eq(variants.productId, products.id))
      .where(eq(offerProducts.offerId, offer.id));

    if (offerProductsList.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No products in offer');
    }

    // Select variant (use query param or first available)
    let selectedVariant = offerProductsList[0]?.variant;
    if (query.variantId) {
      const found = offerProductsList.find(op => op.variant.id === query.variantId);
      if (found) {
        selectedVariant = found.variant;
      }
    }

    if (!selectedVariant) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No variant available');
    }

    // Check inventory
    if (selectedVariant.inventoryQuantity < query.quantity) {
      throw new AppError(ErrorCodes.INSUFFICIENT_INVENTORY, 'Not enough inventory');
    }

    // Get Shopify connection for this product
    const productConnection = offerProductsList.find(op => op.variant.id === selectedVariant.id);
    if (!productConnection) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Product connection not found');
    }

    const [connection] = await fastify.db
      .select()
      .from(platformConnections)
      .where(eq(platformConnections.id, productConnection.product.connectionId))
      .limit(1);

    if (!connection || connection.platform !== 'shopify') {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Shopify connection not found');
    }

    // Calculate prices
    const originalPrice = selectedVariant.price;
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

    const subtotal = originalPrice * query.quantity;
    const discount = (originalPrice - discountedPrice) * query.quantity;
    const total = discountedPrice * query.quantity;

    // Generate idempotency key (visitor + link + variant)
    const visitorId = query.visitorId ?? generateIdempotencyKey();
    const idempotencyKey = `${visitorId}:${link.code}:${selectedVariant.id}`;

    // Check for existing checkout session (idempotency)
    const [existingSession] = await fastify.db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.idempotencyKey, idempotencyKey),
          gt(checkoutSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (existingSession && existingSession.externalCheckoutUrl) {
      // Redirect to existing checkout
      return reply.redirect(existingSession.externalCheckoutUrl);
    }

    // Create checkout session
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + CHECKOUT_SESSION_TTL_MINUTES);

    const reservationExpiresAt = new Date();
    reservationExpiresAt.setMinutes(reservationExpiresAt.getMinutes() + RESERVATION_TTL_MINUTES);

    // Start transaction for checkout creation
    const [checkoutSession] = await fastify.db.transaction(async (tx) => {
      // Create checkout session
      const [session] = await tx
        .insert(checkoutSessions)
        .values({
          creatorId: offer.creatorId,
          idempotencyKey,
          shortLinkId: link.id,
          attributionContextId: link.attributionContextId,
          offerId: offer.id,
          connectionId: connection.id,
          status: 'pending',
          cartItems: [{
            variantId: selectedVariant.id,
            quantity: query.quantity,
            price: originalPrice,
            offerPrice: discountedPrice,
          }],
          subtotal,
          discount,
          total,
          currency: selectedVariant.currency,
          visitorId,
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
          expiresAt,
        })
        .returning();

      if (!session) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create checkout session');
      }

      // Create reservation
      await tx.insert(reservations).values({
        variantId: selectedVariant.id,
        checkoutSessionId: session.id,
        quantity: query.quantity,
        status: 'pending',
        expiresAt: reservationExpiresAt,
      });

      return [session];
    });

    if (!checkoutSession) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create checkout');
    }

    // Update link click count
    await fastify.db
      .update(shortLinks)
      .set({
        clickCount: sql`${shortLinks.clickCount} + 1`,
        lastClickedAt: new Date(),
      })
      .where(eq(shortLinks.id, link.id));

    // Build Shopify checkout URL
    // In production, this would use Shopify's checkout API
    const credentials = JSON.parse(decrypt(connection.credentials, env.CREDENTIALS_ENCRYPTION_KEY));
    const shopDomain = credentials.shopDomain as string;
    
    // Simple checkout URL (in production, use Shopify Checkout API for better experience)
    const checkoutUrl = `https://${shopDomain}.myshopify.com/cart/${selectedVariant.externalId}:${query.quantity}?checkout[note]=${checkoutSession.id}`;

    // Update session with checkout URL
    await fastify.db
      .update(checkoutSessions)
      .set({
        externalCheckoutUrl: checkoutUrl,
        status: 'redirected',
        redirectedAt: new Date(),
      })
      .where(eq(checkoutSessions.id, checkoutSession.id));

    // Emit events
    await fastify.emitEvent(EVENT_TYPES.LINK_CLICKED, {
      linkId: link.id,
      code: link.code,
      checkoutSessionId: checkoutSession.id,
    }, { creatorId: offer.creatorId });

    await fastify.emitEvent(EVENT_TYPES.CHECKOUT_STARTED, {
      checkoutSessionId: checkoutSession.id,
      shortLinkId: link.id,
      offerId: offer.id,
      attributionContextId: link.attributionContextId,
      cartTotal: total,
      itemCount: query.quantity,
    }, { creatorId: offer.creatorId });

    // Redirect to Shopify checkout
    return reply.redirect(checkoutUrl);
  });
}
