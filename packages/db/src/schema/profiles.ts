import { pgTable, text, timestamp, uuid, varchar, boolean, jsonb } from 'drizzle-orm/pg-core';

/**
 * Profiles table - mirrors Supabase's public.profiles table
 * Created by Supabase trigger when a new auth.users record is created
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // References auth.users(id) in Supabase
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  handle: varchar('handle', { length: 100 }).unique(),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
