import { pgTable, timestamp, uuid, varchar, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { creators } from './creators.js';
import { offers } from './offers.js';
import { attributionContexts } from './attribution.js';

// Short links (Moment Links - proto-tokens)
export const shortLinks = pgTable(
  'short_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    
    // The short code (e.g., "abc123" for /go/abc123)
    code: varchar('code', { length: 20 }).notNull().unique(),
    
    // What this link points to
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    
    // Attribution context
    attributionContextId: uuid('attribution_context_id')
      .notNull()
      .references(() => attributionContexts.id),
    
    // Link metadata
    name: varchar('name', { length: 255 }), // friendly name for the creator
    
    // Expiry and revocation
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isRevoked: boolean('is_revoked').default(false).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    
    // Usage limits
    maxClicks: integer('max_clicks'), // null = unlimited
    clickCount: integer('click_count').default(0).notNull(),
    
    // Tracking
    lastClickedAt: timestamp('last_clicked_at', { withTimezone: true }),
    
    // Additional context passed to checkout
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: index('short_links_code_idx').on(table.code),
    creatorIdx: index('short_links_creator_idx').on(table.creatorId),
    offerIdx: index('short_links_offer_idx').on(table.offerId),
    expiresAtIdx: index('short_links_expires_at_idx').on(table.expiresAt),
  })
);

// Relations
export const shortLinksRelations = relations(shortLinks, ({ one }) => ({
  creator: one(creators, {
    fields: [shortLinks.creatorId],
    references: [creators.id],
  }),
  offer: one(offers, {
    fields: [shortLinks.offerId],
    references: [offers.id],
  }),
  attributionContext: one(attributionContexts, {
    fields: [shortLinks.attributionContextId],
    references: [attributionContexts.id],
  }),
}));
