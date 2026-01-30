import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { checkoutSessions, orders, creators, profiles } from '@unifyed/db/schema';
import * as stripeIntegration from '@unifyed/integrations-stripe';
import { AppError, ErrorCodes } from '@unifyed/utils';
import { authPlugin } from '../plugins/auth.js';
import { env } from '../config/env.js';

// Initialize Stripe
stripeIntegration.initStripe({
  secretKey: env.STRIPE_SECRET_KEY,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  connectClientId: env.STRIPE_CONNECT_CLIENT_ID,
});

// Validation schemas
const createCheckoutSchema = z.object({
  checkoutSessionId: z.string().uuid(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const getPaymentStatusSchema = z.object({
  sessionId: z.string(),
});

export async function paymentsRoutes(fastify: FastifyInstance) {
  // =============================================
  // Public Routes (for checkout flow)
  // =============================================

  // POST /payments/create-checkout - Create Stripe checkout from our checkout session
  fastify.post('/create-checkout', async (request, reply) => {
    const { checkoutSessionId, successUrl, cancelUrl } = createCheckoutSchema.parse(request.body);

    // Get our checkout session with creator info
    const [session] = await fastify.db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, checkoutSessionId))
      .limit(1);

    if (!session) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Checkout session not found');
    }

    if (session.status !== 'pending') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Checkout session is ${session.status}`);
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      throw new AppError(ErrorCodes.CHECKOUT_EXPIRED, 'Checkout session has expired');
    }

    // Get creator to check for Connect account
    const [creator] = await fastify.db
      .select()
      .from(creators)
      .where(eq(creators.id, session.creatorId))
      .limit(1);

    const creatorMetadata = creator?.metadata as Record<string, unknown> | null;
    const stripeConnectAccountId = creatorMetadata?.['stripeConnectAccountId'] as string | undefined;

    // Parse cart items
    const cartItems = session.cartItems as Array<{
      variantId: string;
      quantity: number;
      price: number;
      offerPrice?: number;
      title?: string;
      imageUrl?: string;
    }>;

    // Create Stripe checkout session
    const lineItems = cartItems.map((item) => ({
      name: item.title ?? 'Product',
      unitAmount: item.offerPrice ?? item.price,
      quantity: item.quantity,
      currency: session.currency.toLowerCase(),
      imageUrl: item.imageUrl,
    }));

    const stripeParams: stripeIntegration.CreateCheckoutSessionParams = {
      lineItems,
      successUrl: successUrl ?? `${env.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancelUrl ?? `${env.APP_URL}/checkout/cancel`,
      customerEmail: session.customerEmail ?? undefined,
      metadata: {
        unifyed_checkout_session_id: session.id,
        creator_id: session.creatorId,
        offer_id: session.offerId ?? '',
        attribution_context_id: session.attributionContextId ?? '',
      },
      clientReferenceId: session.id,
    };

    // If creator has Connect account, route payment to them
    if (stripeConnectAccountId) {
      stripeParams.connectedAccountId = stripeConnectAccountId;
      stripeParams.applicationFeeAmount = stripeIntegration.calculatePlatformFee(session.total);
    }

    const stripeSession = await stripeIntegration.createCheckoutSession(stripeParams);

    // Update our checkout session with Stripe session URL
    await fastify.db
      .update(checkoutSessions)
      .set({
        externalCheckoutUrl: stripeSession.url,
        externalCheckoutId: stripeSession.id,
        updatedAt: new Date(),
      })
      .where(eq(checkoutSessions.id, checkoutSessionId));

    return reply.send({
      checkoutUrl: stripeSession.url,
      stripeSessionId: stripeSession.id,
    });
  });

  // GET /payments/status/:sessionId - Get payment status
  fastify.get('/status/:sessionId', async (request, reply) => {
    const { sessionId } = getPaymentStatusSchema.parse(request.params);

    // Try to find by our session ID first
    const [session] = await fastify.db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId))
      .limit(1);

    if (session) {
      const stripeSessionId = session.externalCheckoutId;
      
      if (stripeSessionId) {
        try {
          const stripeSession = await stripeIntegration.getCheckoutSession(stripeSessionId);
          
          return reply.send({
            status: session.status,
            paymentStatus: stripeSession.payment_status,
            stripeStatus: stripeSession.status,
            amountTotal: stripeSession.amount_total,
            currency: stripeSession.currency,
          });
        } catch {
          // Stripe session not found or expired
        }
      }

      return reply.send({
        status: session.status,
        paymentStatus: 'pending',
      });
    }

    // Maybe it's a Stripe session ID directly
    try {
      const stripeSession = await stripeIntegration.getCheckoutSession(sessionId);
      
      return reply.send({
        status: stripeSession.status,
        paymentStatus: stripeSession.payment_status,
        amountTotal: stripeSession.amount_total,
        currency: stripeSession.currency,
        clientReferenceId: stripeSession.client_reference_id,
      });
    } catch {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Session not found');
    }
  });

  // =============================================
  // Protected Routes (for creators)
  // =============================================

  await fastify.register(async function protectedRoutes(fastify) {
    await fastify.register(authPlugin);
    fastify.addHook('onRequest', fastify.authenticate);

    // GET /payments/config - Get Stripe publishable key
    fastify.get('/config', async (_request, reply) => {
      return reply.send({
        publishableKey: env.STRIPE_PUBLISHABLE_KEY,
      });
    });

    // POST /payments/connect/onboard - Start Connect onboarding
    fastify.post('/connect/onboard', async (request, reply) => {
      // Get full profile with metadata
      const [profile] = await fastify.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, request.creator.id))
        .limit(1);

      if (!profile) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Profile not found');
      }

      const profileMetadata = profile.metadata as Record<string, unknown> | null;
      const existingAccountId = profileMetadata?.['stripeConnectAccountId'] as string | undefined;

      if (existingAccountId) {
        // Check account status
        try {
          const account = await stripeIntegration.getConnectAccount(existingAccountId);

          if (account.detailsSubmitted && account.chargesEnabled) {
            return reply.send({
              status: 'active',
              account,
              message: 'Connect account is already active',
            });
          }

          // Account exists but needs more info - create new onboarding link
          const onboardingUrl = await stripeIntegration.createAccountLink(
            existingAccountId,
            `${env.APP_URL}/dashboard/settings?refresh=true`,
            `${env.APP_URL}/dashboard/settings?connected=true`
          );

          return reply.send({
            status: 'pending',
            onboardingUrl,
            message: 'Please complete your Connect onboarding',
          });
        } catch {
          // Account doesn't exist anymore, create new one
        }
      }

      // Create new Connect account
      const { account, onboardingUrl } = await stripeIntegration.createConnectAccount({
        email: profile.email,
        metadata: {
          creator_id: profile.id,
          creator_handle: profile.handle ?? '',
        },
        refreshUrl: `${env.APP_URL}/dashboard/settings?refresh=true`,
        returnUrl: `${env.APP_URL}/dashboard/settings?connected=true`,
      });

      // Save Connect account ID to profile metadata
      await fastify.db
        .update(profiles)
        .set({
          metadata: {
            ...profileMetadata,
            stripeConnectAccountId: account.id,
          },
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, profile.id));

      return reply.send({
        status: 'created',
        accountId: account.id,
        onboardingUrl,
        message: 'Connect account created. Please complete onboarding.',
      });
    });

    // GET /payments/connect/status - Get Connect account status
    fastify.get('/connect/status', async (request, reply) => {
      // Get full profile with metadata
      const [profile] = await fastify.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, request.creator.id))
        .limit(1);

      if (!profile) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Profile not found');
      }

      const profileMetadata = profile.metadata as Record<string, unknown> | null;
      const accountId = profileMetadata?.['stripeConnectAccountId'] as string | undefined;

      if (!accountId) {
        return reply.send({
          connected: false,
          message: 'No Connect account linked',
        });
      }

      try {
        const account = await stripeIntegration.getConnectAccount(accountId);

        return reply.send({
          connected: true,
          accountId: account.id,
          chargesEnabled: account.chargesEnabled,
          payoutsEnabled: account.payoutsEnabled,
          detailsSubmitted: account.detailsSubmitted,
          country: account.country,
          defaultCurrency: account.defaultCurrency,
        });
      } catch {
        return reply.send({
          connected: false,
          message: 'Connect account not found or invalid',
        });
      }
    });

    // GET /payments/connect/dashboard - Get link to Stripe dashboard
    fastify.get('/connect/dashboard', async (request, reply) => {
      // Get full profile with metadata
      const [profile] = await fastify.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, request.creator.id))
        .limit(1);

      if (!profile) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Profile not found');
      }

      const profileMetadata = profile.metadata as Record<string, unknown> | null;
      const accountId = profileMetadata?.['stripeConnectAccountId'] as string | undefined;

      if (!accountId) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'No Connect account linked');
      }

      const account = await stripeIntegration.getConnectAccount(accountId);

      if (!account.detailsSubmitted) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Please complete Connect onboarding first');
      }

      const dashboardUrl = await stripeIntegration.createLoginLink(accountId);

      return reply.send({
        dashboardUrl,
      });
    });

    // DELETE /payments/connect - Disconnect Connect account
    fastify.delete('/connect', async (request, reply) => {
      // Get full profile with metadata
      const [profile] = await fastify.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, request.creator.id))
        .limit(1);

      if (!profile) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Profile not found');
      }

      const profileMetadata = profile.metadata as Record<string, unknown> | null;
      const accountId = profileMetadata?.['stripeConnectAccountId'] as string | undefined;

      if (!accountId) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'No Connect account linked');
      }

      // Remove from our database (don't delete the Stripe account)
      const updatedMetadata = { ...profileMetadata };
      delete updatedMetadata['stripeConnectAccountId'];

      await fastify.db
        .update(profiles)
        .set({
          metadata: updatedMetadata,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, profile.id));

      return reply.send({
        success: true,
        message: 'Connect account disconnected',
      });
    });

    // GET /payments/orders - List creator's orders
    fastify.get('/orders', async (request, reply) => {
      const querySchema = z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
      });

      const { page, limit } = querySchema.parse(request.query);
      const offset = (page - 1) * limit;

      const orderList = await fastify.db
        .select()
        .from(orders)
        .where(eq(orders.creatorId, request.creator.id))
        .orderBy(orders.createdAt)
        .limit(limit)
        .offset(offset);

      return reply.send({
        orders: orderList,
        pagination: { page, limit },
      });
    });
  });
}
