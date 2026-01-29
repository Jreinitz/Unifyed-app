import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  // Check if using Supabase pooler (port 6543 or contains 'pooler')
  const isPooler = connectionString.includes(':6543') || connectionString.includes('pooler');
  
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Disable prepared statements when using connection pooler (PgBouncer)
    prepare: !isPooler,
  });

  return drizzle(client, { schema });
}

// Singleton for direct imports (when DATABASE_URL is available)
let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    db = createDatabase(connectionString);
  }
  return db;
}
