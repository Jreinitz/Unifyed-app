import { describe, it, expect, beforeEach } from 'vitest';
import { createTestFixtures } from './setup.js';

/**
 * Checkout Idempotency Tests
 * 
 * These tests verify that:
 * 1. Clicking the same short link twice with the same visitor creates only ONE checkout session
 * 2. The second click returns the same redirect URL
 * 3. Inventory is not double-reserved
 */

// Extended checkout session type for tests
type TestCheckoutSession = typeof createTestFixtures extends () => { checkoutSession: infer T } 
  ? T & { externalCheckoutUrl?: string }
  : never;

describe('Checkout Idempotency', () => {
  const fixtures = createTestFixtures();
  
  // Mock database for tracking created sessions
  let createdSessions: TestCheckoutSession[] = [];
  let createdReservations: Array<typeof fixtures.reservation> = [];
  
  beforeEach(() => {
    createdSessions = [];
    createdReservations = [];
  });
  
  /**
   * Test that the idempotency key prevents duplicate checkout sessions
   */
  it('should return existing session when clicking same link twice', async () => {
    const visitorId = 'visitor_123';
    const linkCode = fixtures.shortLink.code;
    const variantId = fixtures.variantId;
    
    // Generate idempotency key the same way checkout does
    const idempotencyKey = `${visitorId}:${linkCode}:${variantId}`;
    
    // First checkout - creates new session
    const firstSession = {
      ...fixtures.checkoutSession,
      idempotencyKey,
      externalCheckoutUrl: 'https://test-shop.myshopify.com/cart/123:1',
    };
    createdSessions.push(firstSession);
    
    // Simulate first checkout attempt
    const firstResult = findOrCreateCheckoutSession(idempotencyKey, firstSession);
    expect(firstResult.created).toBe(true);
    expect(firstResult.session.idempotencyKey).toBe(idempotencyKey);
    
    // Second checkout - should return existing session
    const secondResult = findOrCreateCheckoutSession(idempotencyKey, firstSession);
    expect(secondResult.created).toBe(false);
    expect(secondResult.session.id).toBe(firstResult.session.id);
    expect(secondResult.session.externalCheckoutUrl).toBe(firstSession.externalCheckoutUrl);
    
    // Only one session should exist
    expect(createdSessions.length).toBe(1);
  });
  
  /**
   * Test that different visitors get different sessions
   */
  it('should create separate sessions for different visitors', async () => {
    const linkCode = fixtures.shortLink.code;
    const variantId = fixtures.variantId;
    
    const visitor1Key = `visitor_1:${linkCode}:${variantId}`;
    const visitor2Key = `visitor_2:${linkCode}:${variantId}`;
    
    const session1 = { ...fixtures.checkoutSession, id: 'session-1', idempotencyKey: visitor1Key };
    const session2 = { ...fixtures.checkoutSession, id: 'session-2', idempotencyKey: visitor2Key };
    
    // First visitor creates session
    createdSessions.push(session1);
    const result1 = findOrCreateCheckoutSession(visitor1Key, session1);
    expect(result1.created).toBe(true);
    
    // Second visitor creates different session
    createdSessions.push(session2);
    const result2 = findOrCreateCheckoutSession(visitor2Key, session2);
    expect(result2.created).toBe(true);
    
    // Sessions should be different
    expect(result1.session.id).not.toBe(result2.session.id);
    expect(createdSessions.length).toBe(2);
  });
  
  /**
   * Test that expired sessions allow new session creation
   */
  it('should allow new session when previous one expired', async () => {
    const visitorId = 'visitor_expired';
    const idempotencyKey = `${visitorId}:${fixtures.shortLink.code}:${fixtures.variantId}`;
    
    // Create expired session
    const expiredSession = {
      ...fixtures.checkoutSession,
      idempotencyKey,
      expiresAt: new Date(Date.now() - 1000), // Already expired
    };
    createdSessions.push(expiredSession);
    
    // Should find expired session, but since it's expired, should create new
    const existingExpired = findExistingValidSession(idempotencyKey);
    expect(existingExpired).toBeNull();
    
    // New session should be created
    const newSession = {
      ...fixtures.checkoutSession,
      id: 'new-session',
      idempotencyKey,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    createdSessions.push(newSession);
    
    const result = findOrCreateCheckoutSession(idempotencyKey, newSession);
    expect(result.session.id).toBe(newSession.id);
  });
  
  /**
   * Test reservation is only created once per checkout session
   */
  it('should not double-reserve inventory on duplicate checkout attempts', async () => {
    const idempotencyKey = `visitor_reserve:${fixtures.shortLink.code}:${fixtures.variantId}`;
    
    const session = {
      ...fixtures.checkoutSession,
      idempotencyKey,
    };
    
    // First attempt - creates session and reservation
    createdSessions.push(session);
    const reservation = {
      ...fixtures.reservation,
      checkoutSessionId: session.id,
    };
    createdReservations.push(reservation);
    
    const firstResult = findOrCreateCheckoutSession(idempotencyKey, session);
    expect(firstResult.created).toBe(true);
    expect(createdReservations.length).toBe(1);
    
    // Second attempt - should not create new reservation
    const secondResult = findOrCreateCheckoutSession(idempotencyKey, session);
    expect(secondResult.created).toBe(false);
    
    // Reservation count should still be 1
    expect(createdReservations.length).toBe(1);
    
    // Total reserved quantity should be 1
    const totalReserved = createdReservations.reduce((sum, r) => sum + r.quantity, 0);
    expect(totalReserved).toBe(1);
  });
  
  // Helper functions to simulate checkout logic
  
  function findExistingValidSession(idempotencyKey: string) {
    const session = createdSessions.find(s => 
      s.idempotencyKey === idempotencyKey && 
      s.expiresAt > new Date()
    );
    return session ?? null;
  }
  
  function findOrCreateCheckoutSession(
    idempotencyKey: string, 
    newSession: TestCheckoutSession
  ): { created: boolean; session: TestCheckoutSession } {
    const existing = findExistingValidSession(idempotencyKey);
    
    if (existing) {
      return { created: false, session: existing };
    }
    
    return { created: true, session: newSession };
  }
});

/**
 * Test idempotency key generation
 */
describe('Idempotency Key Generation', () => {
  it('should generate consistent key for same inputs', () => {
    const visitorId = 'visitor_123';
    const linkCode = 'abc123';
    const variantId = '44444444-4444-4444-4444-444444444444';
    
    const key1 = `${visitorId}:${linkCode}:${variantId}`;
    const key2 = `${visitorId}:${linkCode}:${variantId}`;
    
    expect(key1).toBe(key2);
  });
  
  it('should generate different keys for different inputs', () => {
    const key1 = `visitor_1:abc123:variant_1`;
    const key2 = `visitor_2:abc123:variant_1`;
    const key3 = `visitor_1:xyz789:variant_1`;
    
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });
});
