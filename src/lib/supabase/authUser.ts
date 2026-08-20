import { getSupabase } from "@/lib/supabase/client";

/** Current auth user id, or null when signed out / unconfigured. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return data.user.id;
}
