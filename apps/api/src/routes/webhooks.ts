import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { 
  orders, 
  checkoutSessions, 
  reservations, 
  platformConnections,
} from '@unifyed/db/schema';
import { AppError, ErrorCodes, verifyHmacSignature } from '@unifyed/utils';
import { EVENT_TYPES } from '@unifyed/events';
import * as stripeIntegration from '@unifyed/integrations-stripe';
import { env } from '../config/env.js';

// Initialize Stripe for webhooks
stripeIntegration.initStripe({
  secretKey: env.STRIPE_SECRET_KEY,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET,
});

interface ShopifyOrder {
  id: number;
  order_number: string;
  email: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  total_shipping_price_set?: { shop_money?: { amount: string } };
  currency: string;
  created_at: string;
  note?: string;
  line_items: Array<{
    variant_id: number;
    title: string;
    quantity: number;
    price: string;
  }>;
  customer?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

export async function webhooksRoutes(fastify: FastifyInstance) {
  // Disable body parsing for webhooks (need raw body for signature verification)
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // POST /webhooks/shopify/orders - Shopify order webhook
  fastify.post('/shopify/orders', async (request, reply) => {
    const rawBody = request.body as Buffer;
    const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
    const shopDomain = request.headers['x-shopify-shop-domain'] as string;
    const topic = request.headers['x-shopify-topic'] as string;

    if (!hmacHeader || !shopDomain || !topic) {
      throw new AppError(ErrorCodes.WEBHOOK_VERIFICATION_FAILED, 'Missing webhook headers');
    }

    // Find connection by shop domain
    const shopName = shopDomain.replace('.myshopify.com', '');
    const [connection] = await fastify.db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.platform, 'shopify'),
          eq(platformConnections.externalId, shopName)
        )
      )
      .limit(1);

    if (!connection) {
      request.log.warn({ shopDomain }, 'Shopify webhook from unknown shop');
      return reply.status(200).send({ received: true });
    }

    // Verify webhook signature
    // In production, use the app's webhook signing secret
    if (env.SHOPIFY_CLIENT_SECRET) {
      const isValid = verifyHmacSignature(
        rawBody.toString('utf8'),
        hmacHeader,
        env.SHOPIFY_CLIENT_SECRET
      );

      if (!isValid) {
        throw new AppError(ErrorCodes.WEBHOOK_VERIFICATION_FAILED, 'Invalid webhook signature');
      }
    }

    // Parse order data
    const orderData = JSON.parse(rawBody.toString('utf8')) as ShopifyOrder;

    // Check for idempotency (already processed this webhook)
    const [existingOrder] = await fastify.db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.connectionId, connection.id),
          eq(orders.externalOrderId, String(orderData.id))
        )
      )
      .limit(1);

    if (existingOrder) {
      request.log.debug({ orderId: existingOrder.id }, 'Order already processed');
      return reply.status(200).send({ received: true, duplicate: true });
    }

    // Try to find checkout session by note (we store session ID in checkout note)
    let checkoutSession = null;
    let attributionContextId = null;

    if (orderData.note) {
      [checkoutSession] = await fastify.db
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, orderData.note))
        .limit(1);

      if (checkoutSession) {
        attributionContextId = checkoutSession.attributionContextId;
      }
    }

    // Convert prices to cents
    const toCents = (price: string) => Math.round(parseFloat(price) * 100);

    // Create order
    const [order] = await fastify.db
      .insert(orders)
      .values({
        creatorId: connection.creatorId,
        checkoutSessionId: checkoutSession?.id,
        attributionContextId,
        connectionId: connection.id,
        externalOrderId: String(orderData.id),
        externalOrderNumber: String(orderData.order_number),
        status: 'confirmed',
        subtotal: toCents(orderData.subtotal_price),
        discount: toCents(orderData.total_discounts),
        shipping: orderData.total_shipping_price_set?.shop_money 
          ? toCents(orderData.total_shipping_price_set.shop_money.amount)
          : 0,
        tax: toCents(orderData.total_tax),
        total: toCents(orderData.total_price),
        currency: orderData.currency,
        customerEmail: orderData.customer?.email ?? orderData.email,
        customerName: orderData.customer
          ? `${orderData.customer.first_name ?? ''} ${orderData.customer.last_name ?? ''}`.trim()
          : null,
        lineItems: orderData.line_items.map(item => ({
          variantId: '', // We'd need to look this up
          externalVariantId: String(item.variant_id),
          title: item.title,
          quantity: item.quantity,
          price: toCents(item.price),
        })),
        rawPayload: orderData as unknown as Record<string, unknown>,
        externalCreatedAt: new Date(orderData.created_at),
      })
      .returning();

    if (!order) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create order');
    }

    // If we have a checkout session, update it and confirm reservations
    if (checkoutSession) {
      await fastify.db
        .update(checkoutSessions)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(checkoutSessions.id, checkoutSession.id));

      // Confirm reservations
      await fastify.db
        .update(reservations)
        .set({
          status: 'confirmed',
          updatedAt: new Date(),
        })
        .where(eq(reservations.checkoutSessionId, checkoutSession.id));
    }

    // Emit event
    await fastify.emitEvent(EVENT_TYPES.PURCHASE_COMPLETED, {
      orderId: order.id,
      checkoutSessionId: checkoutSession?.id ?? null,
      attributionContextId,
      externalOrderId: order.externalOrderId,
      total: order.total,
      currency: order.currency,
      itemCount: orderData.line_items.reduce((sum, item) => sum + item.quantity, 0),
    }, { creatorId: connection.creatorId });

    request.log.info({ orderId: order.id, externalOrderId: order.externalOrderId }, 'Order created from webhook');

    return reply.status(200).send({ received: true, orderId: order.id });
  });

  // POST /webhooks/shopify/inventory - Shopify inventory webhook
  fastify.post('/shopify/inventory', async (request, reply) => {
    const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
    const shopDomain = request.headers['x-shopify-shop-domain'] as string;

    if (!hmacHeader || !shopDomain) {
      throw new AppError(ErrorCodes.WEBHOOK_VERIFICATION_FAILED, 'Missing webhook headers');
    }

    // Similar verification and processing as orders webhook
    // Update inventory_snapshots and variants.inventory_quantity

    return reply.status(200).send({ received: true });
  });

  // =============================================
  // Stripe Webhooks
  // =============================================

  // POST /webhooks/stripe - Stripe webhook handler
  fastify.post('/stripe', async (request, reply) => {
    const rawBody = request.body as Buffer;
    const signature = request.headers['stripe-signature'] as string;

    if (!signature) {
      throw new AppError(ErrorCodes.WEBHOOK_VERIFICATION_FAILED, 'Missing Stripe signature');
    }

    // Verify and construct the event
    let event: stripeIntegration.Stripe.Event;
    
    try {
      if (!env.STRIPE_WEBHOOK_SECRET) {
        // In development without webhook secret, just parse the JSON
        event = JSON.parse(rawBody.toString('utf8')) as stripeIntegration.Stripe.Event;
        request.log.warn('Stripe webhook signature not verified (no webhook secret configured)');
      } else {
        event = stripeIntegration.constructWebhookEvent(
          rawBody,
          signature,
          env.STRIPE_WEBHOOK_SECRET
        );
      }
    } catch (err) {
      request.log.error({ err }, 'Stripe webhook signature verification failed');
      throw new AppError(ErrorCodes.WEBHOOK_VERIFICATION_FAILED, 'Invalid Stripe signature');
    }

    request.log.info({ eventType: event.type, eventId: event.id }, 'Processing Stripe webhook');

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as stripeIntegration.Stripe.Checkout.Session;
        await handleStripeCheckoutCompleted(fastify, session);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as stripeIntegration.Stripe.Checkout.Session;
        await handleStripeCheckoutExpired(fastify, session);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as stripeIntegration.Stripe.PaymentIntent;
        request.log.info({ paymentIntentId: paymentIntent.id }, 'Payment intent succeeded');
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as stripeIntegration.Stripe.PaymentIntent;
        request.log.warn({ 
          paymentIntentId: paymentIntent.id,
          error: paymentIntent.last_payment_error?.message,
        }, 'Payment intent failed');
        break;
      }

      default:
        request.log.debug({ eventType: event.type }, 'Unhandled Stripe event type');
    }

    return reply.status(200).send({ received: true });
  });
}

// =============================================
// Stripe Webhook Handlers
// =============================================

async function handleStripeCheckoutCompleted(
  fastify: FastifyInstance,
  session: stripeIntegration.Stripe.Checkout.Session
) {
  const unifydSessionId = session.client_reference_id ?? session.metadata?.['unifyed_checkout_session_id'];

  if (!unifydSessionId) {
    fastify.log.warn({ stripeSessionId: session.id }, 'Stripe checkout completed without Unifyed session ID');
    return;
  }

  // Find our checkout session
  const [checkoutSession] = await fastify.db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, unifydSessionId))
    .limit(1);

  if (!checkoutSession) {
    fastify.log.warn({ unifydSessionId }, 'Checkout session not found for Stripe webhook');
    return;
  }

  // Check idempotency - already completed?
  if (checkoutSession.status === 'completed') {
    fastify.log.debug({ unifydSessionId }, 'Checkout session already completed');
    return;
  }

  // Create order from Stripe session
  const cartItems = checkoutSession.cartItems as Array<{
    variantId: string;
    quantity: number;
    price: number;
    offerPrice?: number;
    title?: string;
  }>;

  const [order] = await fastify.db
    .insert(orders)
    .values({
      creatorId: checkoutSession.creatorId,
      checkoutSessionId: checkoutSession.id,
      attributionContextId: checkoutSession.attributionContextId,
      connectionId: checkoutSession.connectionId,
      externalOrderId: (session.payment_intent as string) ?? session.id,
      externalOrderNumber: session.id.slice(-8).toUpperCase(),
      status: 'confirmed',
      subtotal: checkoutSession.subtotal,
      discount: checkoutSession.discount,
      shipping: 0,
      tax: 0,
      total: checkoutSession.total,
      currency: checkoutSession.currency,
      customerEmail: session.customer_email ?? undefined,
      lineItems: cartItems.map(item => ({
        variantId: item.variantId,
        externalVariantId: '',
        title: item.title ?? 'Product',
        quantity: item.quantity,
        price: item.offerPrice ?? item.price,
      })),
      rawPayload: {
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent,
        stripeCustomerId: session.customer,
      },
    })
    .returning();

  if (!order) {
    fastify.log.error({ unifydSessionId }, 'Failed to create order from Stripe checkout');
    return;
  }

  // Update checkout session
  await fastify.db
    .update(checkoutSessions)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(checkoutSessions.id, checkoutSession.id));

  // Confirm reservations
  await fastify.db
    .update(reservations)
    .set({
      status: 'confirmed',
      updatedAt: new Date(),
    })
    .where(eq(reservations.checkoutSessionId, checkoutSession.id));

  // Emit event
  await fastify.emitEvent(EVENT_TYPES.PURCHASE_COMPLETED, {
    orderId: order.id,
    checkoutSessionId: checkoutSession.id,
    attributionContextId: checkoutSession.attributionContextId,
    externalOrderId: order.externalOrderId,
    total: order.total,
    currency: order.currency,
    itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
  }, { creatorId: checkoutSession.creatorId });

  fastify.log.info({ orderId: order.id, stripeSessionId: session.id }, 'Order created from Stripe checkout');
}

async function handleStripeCheckoutExpired(
  fastify: FastifyInstance,
  session: stripeIntegration.Stripe.Checkout.Session
) {
  const unifydSessionId = session.client_reference_id ?? session.metadata?.['unifyed_checkout_session_id'];

  if (!unifydSessionId) {
    return;
  }

  // Update checkout session to abandoned
  await fastify.db
    .update(checkoutSessions)
    .set({
      status: 'abandoned',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(checkoutSessions.id, unifydSessionId),
        eq(checkoutSessions.status, 'pending')
      )
    );

  // Expire reservations
  await fastify.db
    .update(reservations)
    .set({
      status: 'expired',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reservations.checkoutSessionId, unifydSessionId),
        eq(reservations.status, 'pending')
      )
    );

  fastify.log.info({ unifydSessionId }, 'Checkout session expired from Stripe');
}
