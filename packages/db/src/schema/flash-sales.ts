import { pgTable, timestamp, uuid, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';
import { offers } from './offers.js';

// Flash sale status
export const flashSaleStatusEnum = pgEnum('flash_sale_status', [
  'scheduled',
  'active',
  'ended',
  'cancelled',
]);

// Flash sales - time-limited deals announced to chat
export const flashSales = pgTable(
  'flash_sales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    
    // Discount values (percentage points)
    originalDiscount: integer('original_discount').notNull(),
    flashDiscount: integer('flash_discount').notNull(), // Additional or total discount during flash sale
    
    // Timing
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    
    // Status
    status: flashSaleStatusEnum('status').default('scheduled').notNull(),
    
    // Stats
    ordersCount: integer('orders_count').default(0).notNull(),
    revenueTotal: integer('revenue_total').default(0).notNull(), // cents
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index('flash_sales_creator_idx').on(table.creatorId),
    offerIdx: index('flash_sales_offer_idx').on(table.offerId),
    statusIdx: index('flash_sales_status_idx').on(table.status),
    endsAtIdx: index('flash_sales_ends_at_idx').on(table.endsAt),
  })
);

// Relations
export const flashSalesRelations = relations(flashSales, ({ one }) => ({
  creator: one(creators, {
    fields: [flashSales.creatorId],
    references: [creators.id],
  }),
  offer: one(offers, {
    fields: [flashSales.offerId],
    references: [offers.id],
  }),
}));
