import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

// Create Supabase client with service role key for admin operations
// This bypasses RLS and should only be used server-side
export function createSupabaseAdminClient() {
  const { url, serviceKey } = getSupabaseConfig();
  return createClient(url, serviceKey);
}

// Create Supabase client with user's JWT for authenticated operations
// This respects RLS policies
export function createSupabaseUserClient(jwt: string) {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

// Type for Supabase user
export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

// Helper to get user from JWT
export async function getUserFromJwt(jwt: string): Promise<SupabaseUser | null> {
  try {
    const supabase = createSupabaseUserClient(jwt);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    };
  } catch {
    return null;
  }
}
