import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Prefer the new publishable key (sb_publishable_...).
 * Fall back to legacy anon JWT for older projects still mid-migration.
 */
export function getSupabasePublicKey(): string | undefined {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishable) return publishable;
  const legacyAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return legacyAnon || undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && getSupabasePublicKey()
  );
}

/** Browser Supabase client with persisted auth session, or null when env vars are missing. */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;
  if (client) return client;
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
