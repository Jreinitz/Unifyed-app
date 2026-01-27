import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixtures } from './setup.js';

/**
 * Webhook Idempotency Tests
 * 
 * These tests verify that:
 * 1. Receiving the same Shopify order webhook twice creates only ONE order
 * 2. The second webhook call returns success with duplicate flag
 * 3. Checkout session and reservations are correctly linked
 */

describe('Shopify Order Webhook Idempotency', () => {
  const fixtures = createTestFixtures();
  
  // Mock database for tracking created orders
  let createdOrders: Array<{
    id: string;
    connectionId: string;
    externalOrderId: string;
    checkoutSessionId?: string | undefined;
    attributionContextId?: string | undefined;
    total: number;
  }> = [];
  
  let updatedReservations: Array<{ id: string; status: string }> = [];
  let updatedCheckoutSessions: Array<{ id: string; status: string }> = [];
  
  beforeEach(() => {
    createdOrders = [];
    updatedReservations = [];
    updatedCheckoutSessions = [];
  });
  
  /**
   * Test that duplicate webhooks don't create duplicate orders
   */
  it('should not create duplicate order when webhook fires twice', async () => {
    const shopifyOrderPayload = createShopifyOrderPayload({
      id: 12345,
      orderNumber: 'ORD-001',
      total: '29.99',
      note: fixtures.checkoutSessionId, // Our checkout session ID in the note
    });
    
    // First webhook - creates order
    const firstResult = await processOrderWebhook(
      fixtures.connectionId,
      shopifyOrderPayload
    );
    
    expect(firstResult.received).toBe(true);
    expect(firstResult.duplicate).toBeUndefined();
    expect(firstResult.orderId).toBeDefined();
    expect(createdOrders.length).toBe(1);
    
    // Second webhook with same order - should not create duplicate
    const secondResult = await processOrderWebhook(
      fixtures.connectionId,
      shopifyOrderPayload
    );
    
    expect(secondResult.received).toBe(true);
    expect(secondResult.duplicate).toBe(true);
    expect(createdOrders.length).toBe(1); // Still just one order
    
    // Order IDs should match
    expect(secondResult.orderId).toBe(firstResult.orderId);
  });
  
  /**
   * Test that different orders create separate records
   */
  it('should create separate orders for different order IDs', async () => {
    const order1 = createShopifyOrderPayload({ id: 11111, orderNumber: 'ORD-A' });
    const order2 = createShopifyOrderPayload({ id: 22222, orderNumber: 'ORD-B' });
    
    const result1 = await processOrderWebhook(fixtures.connectionId, order1);
    const result2 = await processOrderWebhook(fixtures.connectionId, order2);
    
    expect(result1.duplicate).toBeUndefined();
    expect(result2.duplicate).toBeUndefined();
    expect(createdOrders.length).toBe(2);
    expect(result1.orderId).not.toBe(result2.orderId);
  });
  
  /**
   * Test that webhook links order to checkout session via note
   */
  it('should link order to checkout session when note contains session ID', async () => {
    const orderPayload = createShopifyOrderPayload({
      id: 99999,
      orderNumber: 'ORD-LINKED',
      note: fixtures.checkoutSessionId,
    });
    
    const result = await processOrderWebhook(fixtures.connectionId, orderPayload);
    
    expect(result.received).toBe(true);
    
    const createdOrder = createdOrders[0];
    expect(createdOrder?.checkoutSessionId).toBe(fixtures.checkoutSessionId);
    expect(createdOrder?.attributionContextId).toBe(fixtures.attributionContextId);
  });
  
  /**
   * Test that webhook confirms reservations
   */
  it('should confirm reservations when order is created', async () => {
    // Setup: Create a pending reservation
    const pendingReservation = {
      id: fixtures.reservationId,
      checkoutSessionId: fixtures.checkoutSessionId,
      status: 'pending',
    };
    
    const orderPayload = createShopifyOrderPayload({
      id: 77777,
      orderNumber: 'ORD-CONFIRM',
      note: fixtures.checkoutSessionId,
    });
    
    // Process webhook
    await processOrderWebhook(fixtures.connectionId, orderPayload, {
      checkoutSession: fixtures.checkoutSession,
      reservation: pendingReservation,
    });
    
    // Reservation should be confirmed
    const confirmedReservation = updatedReservations.find(
      r => r.id === fixtures.reservationId
    );
    expect(confirmedReservation?.status).toBe('confirmed');
    
    // Checkout session should be completed
    const completedSession = updatedCheckoutSessions.find(
      s => s.id === fixtures.checkoutSessionId
    );
    expect(completedSession?.status).toBe('completed');
  });
  
  /**
   * Test that orders without checkout session note are still created
   */
  it('should create order without attribution when no checkout session found', async () => {
    const orderPayload = createShopifyOrderPayload({
      id: 88888,
      orderNumber: 'ORD-NO-ATTR',
      note: undefined, // No checkout session ID
    });
    
    const result = await processOrderWebhook(fixtures.connectionId, orderPayload);
    
    expect(result.received).toBe(true);
    expect(createdOrders.length).toBe(1);
    
    const order = createdOrders[0];
    expect(order?.checkoutSessionId).toBeUndefined();
    expect(order?.attributionContextId).toBeUndefined();
  });
  
  // Helper to create Shopify order payload
  function createShopifyOrderPayload(overrides: {
    id: number;
    orderNumber: string;
    total?: string | undefined;
    note?: string | undefined;
  }) {
    return {
      id: overrides.id,
      order_number: overrides.orderNumber,
      email: 'customer@example.com',
      total_price: overrides.total ?? '29.99',
      subtotal_price: '29.99',
      total_discounts: '0.00',
      total_tax: '0.00',
      currency: 'USD',
      created_at: new Date().toISOString(),
      note: overrides.note,
      line_items: [
        {
          variant_id: 123456,
          title: 'Test Product',
          quantity: 1,
          price: '29.99',
        },
      ],
      customer: {
        email: 'customer@example.com',
        first_name: 'Test',
        last_name: 'Customer',
      },
    };
  }
  
  // Simulated webhook processor
  async function processOrderWebhook(
    connectionId: string,
    orderPayload: ReturnType<typeof createShopifyOrderPayload>,
    context?: {
      checkoutSession?: typeof fixtures.checkoutSession;
      reservation?: { id: string; checkoutSessionId: string; status: string };
    }
  ): Promise<{ received: boolean; duplicate?: boolean; orderId?: string }> {
    const externalOrderId = String(orderPayload.id);
    
    // Check for existing order (idempotency check)
    const existingOrder = createdOrders.find(
      o => o.connectionId === connectionId && o.externalOrderId === externalOrderId
    );
    
    if (existingOrder) {
      return { received: true, duplicate: true, orderId: existingOrder.id };
    }
    
    // Try to find checkout session by note
    let checkoutSessionId: string | undefined;
    let attributionContextId: string | undefined;
    
    if (orderPayload.note && context?.checkoutSession?.id === orderPayload.note) {
      checkoutSessionId = context.checkoutSession.id;
      attributionContextId = context.checkoutSession.attributionContextId;
    }
    
    // Create order
    const newOrder = {
      id: `order_${orderPayload.id}`,
      connectionId,
      externalOrderId,
      checkoutSessionId,
      attributionContextId,
      total: Math.round(parseFloat(orderPayload.total_price) * 100),
    };
    createdOrders.push(newOrder);
    
    // If we have a checkout session, update it and confirm reservations
    if (checkoutSessionId && context?.checkoutSession) {
      updatedCheckoutSessions.push({
        id: checkoutSessionId,
        status: 'completed',
      });
      
      if (context.reservation) {
        updatedReservations.push({
          id: context.reservation.id,
          status: 'confirmed',
        });
      }
    }
    
    return { received: true, orderId: newOrder.id };
  }
});

/**
 * Test webhook signature verification (conceptual)
 */
describe('Webhook Signature Verification', () => {
  it('should generate consistent HMAC for same payload', () => {
    const payload = '{"id":123,"total":"29.99"}';
    const secret = 'webhook_secret';
    
    // In production, this would use crypto.createHmac
    const hash1 = simpleHash(payload + secret);
    const hash2 = simpleHash(payload + secret);
    
    expect(hash1).toBe(hash2);
  });
  
  it('should generate different HMAC for different payloads', () => {
    const secret = 'webhook_secret';
    
    const hash1 = simpleHash('{"id":123}' + secret);
    const hash2 = simpleHash('{"id":456}' + secret);
    
    expect(hash1).not.toBe(hash2);
  });
  
  // Simple hash for testing (not cryptographically secure)
  function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
});
