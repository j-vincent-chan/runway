import { getSupabase } from "@/lib/supabase/client";

/**
 * Fires the transactional email for a delegation request — "please approve"
 * to the PI, "you're in" to the analyst. Immediate, not digested: approvals
 * are rare and gate someone's ability to work at all.
 */
export async function sendDelegationEmail(
  requestId: string,
  kind: "request" | "approved"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Sign in again first." };
  try {
    const response = await fetch("/api/delegation-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId, kind }),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error ?? "The email could not be sent." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "The email could not be sent — check your connection." };
  }
}
