import { pgTable, text, timestamp, uuid, varchar, integer, boolean, jsonb, index, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { platformConnections } from './platform-connections.js';

// Canonical product catalog (synced from commerce backends)
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => platformConnections.id, { onDelete: 'cascade' }),
    
    // External reference (Shopify product ID, etc.)
    externalId: varchar('external_id', { length: 255 }).notNull(),
    
    // Product data
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    vendor: varchar('vendor', { length: 255 }),
    productType: varchar('product_type', { length: 255 }),
    
    // Primary image
    imageUrl: text('image_url'),
    images: jsonb('images').$type<string[]>().default([]),
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    
    // Metadata from source
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>(),
    
    // Sync tracking
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    syncVersion: integer('sync_version').default(1).notNull(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    connectionExternalIdx: uniqueIndex('products_connection_external_idx').on(
      table.connectionId,
      table.externalId
    ),
    activeIdx: index('products_active_idx').on(table.isActive),
  })
);

// Product variants (SKUs)
export const variants = pgTable(
  'variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    
    // External reference
    externalId: varchar('external_id', { length: 255 }).notNull(),
    
    // Variant data
    title: varchar('title', { length: 500 }).notNull(),
    sku: varchar('sku', { length: 255 }),
    barcode: varchar('barcode', { length: 255 }),
    
    // Pricing (in cents for precision)
    price: integer('price').notNull(), // cents
    compareAtPrice: integer('compare_at_price'), // cents, for showing discounts
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    
    // Inventory tracking
    inventoryQuantity: integer('inventory_quantity').default(0).notNull(),
    inventoryPolicy: varchar('inventory_policy', { length: 50 }).default('deny'), // deny, continue
    
    // Options (size, color, etc.)
    option1: varchar('option1', { length: 255 }),
    option2: varchar('option2', { length: 255 }),
    option3: varchar('option3', { length: 255 }),
    
    // Media
    imageUrl: text('image_url'),
    
    // Weight for shipping
    weight: numeric('weight', { precision: 10, scale: 2 }),
    weightUnit: varchar('weight_unit', { length: 10 }).default('kg'),
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
    
    // Shopify-specific
    inventoryItemId: varchar('inventory_item_id', { length: 255 }),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index('variants_product_idx').on(table.productId),
    productExternalIdx: uniqueIndex('variants_product_external_idx').on(table.productId, table.externalId),
    skuIdx: index('variants_sku_idx').on(table.sku),
  })
);

// Relations
export const productsRelations = relations(products, ({ one, many }) => ({
  connection: one(platformConnections, {
    fields: [products.connectionId],
    references: [platformConnections.id],
  }),
  variants: many(variants),
}));

export const variantsRelations = relations(variants, ({ one }) => ({
  product: one(products, {
    fields: [variants.productId],
    references: [products.id],
  }),
}));
