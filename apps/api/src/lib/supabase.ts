import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

// Get Supabase URL from environment
const supabaseUrl = env.SUPABASE_URL || process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL'];
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env['SUPABASE_SERVICE_ROLE_KEY'];

// Create a Supabase client with service role for backend operations
let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
} else {
  console.warn('Supabase credentials not configured - auth verification will fail');
}

// Verify a Supabase JWT token
export async function verifySupabaseToken(token: string) {
  if (!supabase) {
    console.error('Supabase client not configured');
    return null;
  }
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }
  
  return user;
}

export { supabase };
