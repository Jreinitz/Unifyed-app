import { pgTable, timestamp, uuid, integer, text, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { variants } from './products.js';

// Reservation status
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',    // Reserved, waiting for checkout completion
  'confirmed',  // Checkout completed, inventory deducted
  'released',   // Released (expired or cancelled)
  'expired',    // TTL expired
]);

// Point-in-time inventory snapshots
export const inventorySnapshots = pgTable(
  'inventory_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),
    
    // Inventory levels
    availableQuantity: integer('available_quantity').notNull(),
    reservedQuantity: integer('reserved_quantity').default(0).notNull(),
    
    // Source of this snapshot
    source: text('source').notNull(), // 'shopify_sync', 'webhook', 'manual'
    sourceEventId: text('source_event_id'), // external event ID for idempotency
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    variantIdx: index('inventory_snapshots_variant_idx').on(table.variantId),
    createdAtIdx: index('inventory_snapshots_created_at_idx').on(table.createdAt),
  })
);

// Inventory reservations (for checkout sessions)
export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),
    
    // What this reservation is for
    checkoutSessionId: uuid('checkout_session_id').notNull(), // FK added in checkout.ts
    
    // Reservation details
    quantity: integer('quantity').notNull(),
    status: reservationStatusEnum('status').default('pending').notNull(),
    
    // TTL for automatic expiry
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    
    // When it was released (if applicable)
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseReason: text('release_reason'), // 'expired', 'cancelled', 'completed'
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    variantIdx: index('reservations_variant_idx').on(table.variantId),
    checkoutSessionIdx: index('reservations_checkout_session_idx').on(table.checkoutSessionId),
    statusIdx: index('reservations_status_idx').on(table.status),
    expiresAtIdx: index('reservations_expires_at_idx').on(table.expiresAt),
  })
);

// Relations
export const inventorySnapshotsRelations = relations(inventorySnapshots, ({ one }) => ({
  variant: one(variants, {
    fields: [inventorySnapshots.variantId],
    references: [variants.id],
  }),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  variant: one(variants, {
    fields: [reservations.variantId],
    references: [variants.id],
  }),
}));
