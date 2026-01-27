import { pgTable, text, timestamp, uuid, varchar, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';
import { products, variants } from './products.js';

// Offer types
export const offerTypeEnum = pgEnum('offer_type', [
  'percentage_off',
  'fixed_amount_off',
  'fixed_price',
  'bundle',
]);

// Offer status
export const offerStatusEnum = pgEnum('offer_status', [
  'draft',
  'active',
  'paused',
  'expired',
  'archived',
]);

// Offers - decoupled from products
export const offers = pgTable(
  'offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // Offer details
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    
    // Offer type and value
    type: offerTypeEnum('type').notNull(),
    value: integer('value').notNull(), // percentage (0-100) or cents
    
    // Status
    status: offerStatusEnum('status').default('draft').notNull(),
    
    // Time bounds
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    
    // Limits
    maxRedemptions: integer('max_redemptions'), // null = unlimited
    currentRedemptions: integer('current_redemptions').default(0).notNull(),
    maxPerCustomer: integer('max_per_customer').default(1),
    
    // Display
    badgeText: varchar('badge_text', { length: 50 }), // "20% OFF", "LIVE DEAL"
    
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    creatorStatusIdx: index('offers_creator_status_idx').on(table.creatorId, table.status),
    statusIdx: index('offers_status_idx').on(table.status),
  })
);

// Junction table: which products/variants are in an offer
export const offerProducts = pgTable(
  'offer_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // Optional: specific variant. If null, offer applies to all variants
    variantId: uuid('variant_id').references(() => variants.id, { onDelete: 'cascade' }),
    
    // Override the offer value for this specific product/variant
    overrideValue: integer('override_value'),
    
    // Display order
    sortOrder: integer('sort_order').default(0).notNull(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    offerIdx: index('offer_products_offer_idx').on(table.offerId),
    productIdx: index('offer_products_product_idx').on(table.productId),
    uniqueOfferProduct: index('offer_products_unique_idx').on(
      table.offerId,
      table.productId,
      table.variantId
    ),
  })
);

// Relations
export const offersRelations = relations(offers, ({ one, many }) => ({
  creator: one(creators, {
    fields: [offers.creatorId],
    references: [creators.id],
  }),
  offerProducts: many(offerProducts),
}));

export const offerProductsRelations = relations(offerProducts, ({ one }) => ({
  offer: one(offers, {
    fields: [offerProducts.offerId],
    references: [offers.id],
  }),
  product: one(products, {
    fields: [offerProducts.productId],
    references: [products.id],
  }),
  variant: one(variants, {
    fields: [offerProducts.variantId],
    references: [variants.id],
  }),
}));
