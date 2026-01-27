import { pgTable, text, timestamp, uuid, varchar, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';
import { platformConnections } from './platform-connections.js';
import { offers } from './offers.js';
import { attributionContexts } from './attribution.js';
import { reservations } from './inventory.js';

// Checkout session status
export const checkoutStatusEnum = pgEnum('checkout_status', [
  'pending',     // Session created, waiting for redirect
  'redirected',  // User redirected to checkout
  'completed',   // Order placed
  'abandoned',   // Session expired without order
  'failed',      // Checkout failed
]);

// Order status
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'confirmed',
  'fulfilled',
  'cancelled',
  'refunded',
]);

// Checkout sessions
export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Idempotency
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
    
    // Source link
    shortLinkId: uuid('short_link_id'), // FK added in short-links.ts
    
    // Attribution
    attributionContextId: uuid('attribution_context_id')
      .notNull()
      .references(() => attributionContexts.id),
    
    // Offer applied
    offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
    
    // Checkout backend
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => platformConnections.id),
    
    // External checkout reference (Shopify checkout ID, etc.)
    externalCheckoutId: varchar('external_checkout_id', { length: 255 }),
    externalCheckoutUrl: text('external_checkout_url'),
    
    // Session state
    status: checkoutStatusEnum('status').default('pending').notNull(),
    
    // Cart contents (snapshot at time of checkout)
    cartItems: jsonb('cart_items').$type<Array<{
      variantId: string;
      quantity: number;
      price: number;
      offerPrice?: number;
    }>>().notNull(),
    
    // Totals
    subtotal: integer('subtotal').notNull(), // cents
    discount: integer('discount').default(0).notNull(), // cents
    total: integer('total').notNull(), // cents
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    
    // Customer info (for pre-filling checkout)
    customerEmail: varchar('customer_email', { length: 255 }),
    customerName: varchar('customer_name', { length: 255 }),
    
    // Visitor tracking
    visitorId: varchar('visitor_id', { length: 255 }), // fingerprint or cookie ID
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    
    // Timestamps
    redirectedAt: timestamp('redirected_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('checkout_sessions_creator_idx').on(table.creatorId),
    statusIdx: index('checkout_sessions_status_idx').on(table.status),
    shortLinkIdx: index('checkout_sessions_short_link_idx').on(table.shortLinkId),
    externalCheckoutIdx: index('checkout_sessions_external_checkout_idx').on(
      table.externalCheckoutId
    ),
    expiresAtIdx: index('checkout_sessions_expires_at_idx').on(table.expiresAt),
  })
);

// Orders (created from Shopify webhooks)
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Link to checkout session
    checkoutSessionId: uuid('checkout_session_id').references(
      () => checkoutSessions.id,
      { onDelete: 'set null' }
    ),
    
    // Attribution (denormalized for easier querying)
    attributionContextId: uuid('attribution_context_id').references(
      () => attributionContexts.id,
      { onDelete: 'set null' }
    ),
    
    // External order reference
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => platformConnections.id),
    externalOrderId: varchar('external_order_id', { length: 255 }).notNull(),
    externalOrderNumber: varchar('external_order_number', { length: 100 }),
    
    // Order status
    status: orderStatusEnum('status').default('pending').notNull(),
    
    // Financials
    subtotal: integer('subtotal').notNull(), // cents
    discount: integer('discount').default(0).notNull(), // cents
    shipping: integer('shipping').default(0).notNull(), // cents
    tax: integer('tax').default(0).notNull(), // cents
    total: integer('total').notNull(), // cents
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    
    // Customer info (from order)
    customerEmail: varchar('customer_email', { length: 255 }),
    customerName: varchar('customer_name', { length: 255 }),
    
    // Order items snapshot
    lineItems: jsonb('line_items').$type<Array<{
      variantId: string;
      externalVariantId: string;
      title: string;
      quantity: number;
      price: number;
    }>>(),
    
    // Raw webhook payload for debugging
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    
    // Timestamps from external system
    externalCreatedAt: timestamp('external_created_at', { withTimezone: true }),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('orders_creator_idx').on(table.creatorId),
    checkoutSessionIdx: index('orders_checkout_session_idx').on(table.checkoutSessionId),
    attributionContextIdx: index('orders_attribution_context_idx').on(table.attributionContextId),
    externalOrderIdx: index('orders_external_order_idx').on(
      table.connectionId,
      table.externalOrderId
    ),
    statusIdx: index('orders_status_idx').on(table.status),
  })
);

// Relations
export const checkoutSessionsRelations = relations(checkoutSessions, ({ one, many }) => ({
  creator: one(creators, {
    fields: [checkoutSessions.creatorId],
    references: [creators.id],
  }),
  attributionContext: one(attributionContexts, {
    fields: [checkoutSessions.attributionContextId],
    references: [attributionContexts.id],
  }),
  offer: one(offers, {
    fields: [checkoutSessions.offerId],
    references: [offers.id],
  }),
  connection: one(platformConnections, {
    fields: [checkoutSessions.connectionId],
    references: [platformConnections.id],
  }),
  reservations: many(reservations),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  creator: one(creators, {
    fields: [orders.creatorId],
    references: [creators.id],
  }),
  checkoutSession: one(checkoutSessions, {
    fields: [orders.checkoutSessionId],
    references: [checkoutSessions.id],
  }),
  attributionContext: one(attributionContexts, {
    fields: [orders.attributionContextId],
    references: [attributionContexts.id],
  }),
  connection: one(platformConnections, {
    fields: [orders.connectionId],
    references: [platformConnections.id],
  }),
}));
