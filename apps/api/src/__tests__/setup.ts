import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/unifyed_test';
  process.env['REDIS_URL'] = 'redis://localhost:6379';
  process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
  process.env['APP_URL'] = 'http://localhost:3000';
  process.env['API_URL'] = 'http://localhost:3001';
  process.env['CREDENTIALS_ENCRYPTION_KEY'] = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});

// Helper to create mock database
export function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn(async (fn) => fn({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    })),
  };
}

// Helper to create mock Redis
export function createMockRedis() {
  const store = new Map<string, string>();
  
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    setex: vi.fn((key: string, _seconds: number, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    _store: store,
  };
}

// Helper to create test fixtures
export function createTestFixtures() {
  const creatorId = '11111111-1111-1111-1111-111111111111';
  const connectionId = '22222222-2222-2222-2222-222222222222';
  const productId = '33333333-3333-3333-3333-333333333333';
  const variantId = '44444444-4444-4444-4444-444444444444';
  const offerId = '55555555-5555-5555-5555-555555555555';
  const shortLinkId = '66666666-6666-6666-6666-666666666666';
  const attributionContextId = '77777777-7777-7777-7777-777777777777';
  const checkoutSessionId = '88888888-8888-8888-8888-888888888888';
  const reservationId = '99999999-9999-9999-9999-999999999999';
  const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  
  return {
    creatorId,
    connectionId,
    productId,
    variantId,
    offerId,
    shortLinkId,
    attributionContextId,
    checkoutSessionId,
    reservationId,
    orderId,
    
    creator: {
      id: creatorId,
      email: 'test@example.com',
      name: 'Test Creator',
      handle: 'testcreator',
      isActive: true,
    },
    
    connection: {
      id: connectionId,
      creatorId,
      platform: 'shopify' as const,
      externalId: 'test-shop',
      displayName: 'Test Shop',
      status: 'healthy' as const,
    },
    
    product: {
      id: productId,
      connectionId,
      externalId: 'shop_123',
      title: 'Test Product',
      isActive: true,
    },
    
    variant: {
      id: variantId,
      productId,
      externalId: 'var_123',
      title: 'Default',
      price: 2999, // $29.99
      currency: 'USD',
      inventoryQuantity: 10,
    },
    
    offer: {
      id: offerId,
      creatorId,
      name: 'Test Offer',
      type: 'percentage_off' as const,
      value: 20,
      status: 'active' as const,
    },
    
    shortLink: {
      id: shortLinkId,
      creatorId,
      code: 'abc123',
      offerId,
      attributionContextId,
      isRevoked: false,
      clickCount: 0,
    },
    
    attributionContext: {
      id: attributionContextId,
      creatorId,
      surface: 'live' as const,
    },
    
    checkoutSession: {
      id: checkoutSessionId,
      creatorId,
      idempotencyKey: 'test-idempotency-key',
      shortLinkId,
      attributionContextId,
      offerId,
      connectionId,
      status: 'pending' as const,
      cartItems: [{ variantId, quantity: 1, price: 2999, offerPrice: 2399 }],
      subtotal: 2999,
      discount: 600,
      total: 2399,
      currency: 'USD',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
    
    reservation: {
      id: reservationId,
      variantId,
      checkoutSessionId,
      quantity: 1,
      status: 'pending' as const,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  };
}
