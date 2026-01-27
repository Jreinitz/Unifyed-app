// Stripe Integration for Unifyed
// Handles payments, checkout, and Connect for creator payouts

import Stripe from 'stripe';

// ============================================
// Types
// ============================================

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string | undefined;
  connectClientId?: string | undefined;
}

export interface CreateCheckoutSessionParams {
  /** Line items for the checkout */
  lineItems: Array<{
    name: string;
    description?: string | undefined;
    imageUrl?: string | undefined;
    unitAmount: number; // in cents
    quantity: number;
    currency?: string | undefined;
  }>;
  /** Success redirect URL */
  successUrl: string;
  /** Cancel redirect URL */
  cancelUrl: string;
  /** Customer email (optional, for pre-filling) */
  customerEmail?: string | undefined;
  /** Metadata to attach to the session */
  metadata?: Record<string, string> | undefined;
  /** Connected account ID for Connect payments */
  connectedAccountId?: string | undefined;
  /** Application fee amount (in cents) for Connect */
  applicationFeeAmount?: number | undefined;
  /** Client reference ID (e.g., checkout session ID) */
  clientReferenceId?: string | undefined;
}

export interface CreatePaymentIntentParams {
  /** Amount in cents */
  amount: number;
  /** Currency code */
  currency: string;
  /** Payment method types to accept */
  paymentMethodTypes?: string[] | undefined;
  /** Metadata to attach */
  metadata?: Record<string, string> | undefined;
  /** Connected account ID for Connect payments */
  connectedAccountId?: string | undefined;
  /** Application fee amount (in cents) for Connect */
  applicationFeeAmount?: number | undefined;
  /** Description for the payment */
  description?: string | undefined;
}

export interface ConnectAccountParams {
  /** Creator's email */
  email: string;
  /** Creator's country code (ISO 3166-1 alpha-2) */
  country?: string | undefined;
  /** Type of Connect account */
  type?: 'express' | 'standard' | 'custom' | undefined;
  /** Metadata to attach */
  metadata?: Record<string, string> | undefined;
  /** Refresh URL for onboarding */
  refreshUrl: string;
  /** Return URL after onboarding */
  returnUrl: string;
}

export interface ConnectAccount {
  id: string;
  email: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
  createdAt: Date;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
  created: number;
}

// ============================================
// Stripe Client
// ============================================

let stripeClient: Stripe | null = null;

/**
 * Initialize the Stripe client
 */
export function initStripe(config: StripeConfig): Stripe {
  stripeClient = new Stripe(config.secretKey, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });
  return stripeClient;
}

/**
 * Get the initialized Stripe client
 */
export function getStripe(): Stripe {
  if (!stripeClient) {
    throw new Error('Stripe client not initialized. Call initStripe() first.');
  }
  return stripeClient;
}

// ============================================
// Checkout Sessions
// ============================================

/**
 * Create a Stripe Checkout Session
 * Used for one-time purchases with redirect flow
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = params.lineItems.map(
    (item) => {
      const productData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData = {
        name: item.name,
      };
      if (item.description) productData.description = item.description;
      if (item.imageUrl) productData.images = [item.imageUrl];

      return {
        price_data: {
          currency: item.currency ?? 'usd',
          product_data: productData,
          unit_amount: item.unitAmount,
        },
        quantity: item.quantity,
      };
    }
  );

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: lineItems,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  };

  if (params.customerEmail) sessionParams.customer_email = params.customerEmail;
  if (params.metadata) sessionParams.metadata = params.metadata;
  if (params.clientReferenceId) sessionParams.client_reference_id = params.clientReferenceId;

  // If using Connect, add payment intent data with transfer
  if (params.connectedAccountId) {
    sessionParams.payment_intent_data = {
      transfer_data: {
        destination: params.connectedAccountId,
      },
    };
    if (params.applicationFeeAmount) {
      sessionParams.payment_intent_data.application_fee_amount = params.applicationFeeAmount;
    }
  }

  return stripe.checkout.sessions.create(sessionParams);
}

/**
 * Retrieve a checkout session
 */
export async function getCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'payment_intent'],
  });
}

/**
 * Expire a checkout session (cancel it)
 */
export async function expireCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.expire(sessionId);
}

// ============================================
// Payment Intents
// ============================================

/**
 * Create a Payment Intent
 * Used for custom payment flows
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  const intentParams: Stripe.PaymentIntentCreateParams = {
    amount: params.amount,
    currency: params.currency,
    payment_method_types: params.paymentMethodTypes ?? ['card'],
  };

  if (params.metadata) intentParams.metadata = params.metadata;
  if (params.description) intentParams.description = params.description;

  // If using Connect, add application fee and transfer
  if (params.connectedAccountId) {
    intentParams.transfer_data = {
      destination: params.connectedAccountId,
    };
    if (params.applicationFeeAmount) {
      intentParams.application_fee_amount = params.applicationFeeAmount;
    }
  }

  return stripe.paymentIntents.create(intentParams);
}

/**
 * Retrieve a payment intent
 */
export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Confirm a payment intent
 */
export async function confirmPaymentIntent(
  paymentIntentId: string,
  paymentMethodId?: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  
  if (paymentMethodId) {
    return stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }
  
  return stripe.paymentIntents.confirm(paymentIntentId);
}

// ============================================
// Stripe Connect
// ============================================

/**
 * Create a Connect Express account for a creator
 */
export async function createConnectAccount(
  params: ConnectAccountParams
): Promise<{ account: Stripe.Account; onboardingUrl: string }> {
  const stripe = getStripe();

  const accountParams: Stripe.AccountCreateParams = {
    type: params.type ?? 'express',
    email: params.email,
    country: params.country ?? 'US',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  };

  if (params.metadata) accountParams.metadata = params.metadata;

  // Create the Express account
  const account = await stripe.accounts.create(accountParams);

  // Create onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
  });

  return {
    account,
    onboardingUrl: accountLink.url,
  };
}

/**
 * Get Connect account details
 */
export async function getConnectAccount(
  accountId: string
): Promise<ConnectAccount> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);

  return {
    id: account.id,
    email: account.email ?? null,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
    createdAt: account.created ? new Date(account.created * 1000) : new Date(),
  };
}

/**
 * Create a new account link for onboarding/updating
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
  type: 'account_onboarding' | 'account_update' = 'account_onboarding'
): Promise<string> {
  const stripe = getStripe();

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type,
  });

  return accountLink.url;
}

/**
 * Create a login link for Express dashboard
 */
export async function createLoginLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  const loginLink = await stripe.accounts.createLoginLink(accountId);
  return loginLink.url;
}

/**
 * Delete/deauthorize a Connect account
 */
export async function deleteConnectAccount(accountId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.accounts.del(accountId);
}

// ============================================
// Webhooks
// ============================================

/**
 * Verify and construct a webhook event
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Parse a webhook event (simpler version for testing)
 */
export function parseWebhookEvent(event: Stripe.Event): WebhookEvent {
  return {
    id: event.id,
    type: event.type,
    data: {
      object: event.data.object,
    },
    created: event.created,
  };
}

// ============================================
// Refunds
// ============================================

/**
 * Create a refund
 */
export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<Stripe.Refund> {
  const stripe = getStripe();

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
  };

  if (amount !== undefined) refundParams.amount = amount;
  if (reason) refundParams.reason = reason;

  return stripe.refunds.create(refundParams);
}

// ============================================
// Products & Prices (for recurring)
// ============================================

/**
 * Create a product in Stripe
 */
export async function createProduct(
  name: string,
  description?: string,
  images?: string[],
  metadata?: Record<string, string>
): Promise<Stripe.Product> {
  const stripe = getStripe();

  const params: Stripe.ProductCreateParams = { name };
  if (description) params.description = description;
  if (images) params.images = images;
  if (metadata) params.metadata = metadata;

  return stripe.products.create(params);
}

/**
 * Create a price for a product
 */
export async function createPrice(
  productId: string,
  unitAmount: number,
  currency: string = 'usd',
  recurring?: { interval: 'day' | 'week' | 'month' | 'year'; intervalCount?: number }
): Promise<Stripe.Price> {
  const stripe = getStripe();

  const params: Stripe.PriceCreateParams = {
    product: productId,
    unit_amount: unitAmount,
    currency,
  };

  if (recurring) {
    params.recurring = {
      interval: recurring.interval,
      interval_count: recurring.intervalCount ?? 1,
    };
  }

  return stripe.prices.create(params);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format amount from cents to display string
 */
export function formatAmount(amountInCents: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}

/**
 * Calculate platform fee (default 10%)
 */
export function calculatePlatformFee(
  amountInCents: number,
  feePercentage: number = 10
): number {
  return Math.round(amountInCents * (feePercentage / 100));
}

// Re-export Stripe types for convenience
export type { Stripe };
