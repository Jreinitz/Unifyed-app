import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/unifyed_test';
  process.env['REDIS_URL'] = 'redis://localhost:6379';
  process.env['CREDENTIALS_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});

// Helper to create test fixtures for worker tests
export function createWorkerTestFixtures() {
  const variantId = '44444444-4444-4444-4444-444444444444';
  const checkoutSessionId = '88888888-8888-8888-8888-888888888888';
  const reservationId = '99999999-9999-9999-9999-999999999999';
  
  return {
    variantId,
    checkoutSessionId,
    reservationId,
    
    // Active reservation (not expired)
    activeReservation: {
      id: reservationId,
      variantId,
      checkoutSessionId,
      quantity: 2,
      status: 'pending' as const,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min from now
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    
    // Expired reservation
    expiredReservation: {
      id: 'expired-res-id',
      variantId,
      checkoutSessionId: 'expired-session-id',
      quantity: 1,
      status: 'pending' as const,
      expiresAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago (expired)
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
      updatedAt: new Date(Date.now() - 20 * 60 * 1000),
    },
    
    // Checkout session for expired reservation
    expiredCheckoutSession: {
      id: 'expired-session-id',
      status: 'pending' as const,
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
      updatedAt: new Date(Date.now() - 20 * 60 * 1000),
    },
  };
}
