import { getSupabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/supabase/authUser";

/**
 * One row per grant: the PI (owner) names an analyst by email. pi_email is
 * denormalized at grant time because auth.users is not client-queryable and
 * the analyst's workspace picker needs a human-readable owner label.
 */
export type DelegationGrant = {
  piUserId: string;
  piEmail: string;
  analystEmail: string;
  createdAt: string;
};

type DelegateRow = {
  pi_user_id: string;
  pi_email: string;
  analyst_email: string;
  created_at: string;
};

function rowToGrant(row: DelegateRow): DelegationGrant {
  return {
    piUserId: row.pi_user_id,
    piEmail: row.pi_email,
    analystEmail: row.analyst_email,
    createdAt: row.created_at,
  };
}

export function normalizeDelegateEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Grants naming me as the analyst — the workspaces I can switch into. */
export async function fetchDelegationsToMe(myEmail: string): Promise<DelegationGrant[]> {
  const supabase = getSupabase();
  if (!supabase || !myEmail) return [];
  const { data, error } = await supabase
    .from("workspace_delegates")
    .select("pi_user_id, pi_email, analyst_email, created_at")
    .eq("analyst_email", normalizeDelegateEmail(myEmail))
    .order("created_at");
  if (error) {
    console.warn("[supabase] fetch delegations failed:", error.message);
    return [];
  }
  return ((data ?? []) as DelegateRow[]).map(rowToGrant);
}

/** Grants I made as the PI — the analysts with access to my workspace. */
export async function fetchMyDelegates(): Promise<DelegationGrant[]> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("workspace_delegates")
    .select("pi_user_id, pi_email, analyst_email, created_at")
    .eq("pi_user_id", userId)
    .order("created_at");
  if (error) {
    console.warn("[supabase] fetch delegates failed:", error.message);
    return [];
  }
  return ((data ?? []) as DelegateRow[]).map(rowToGrant);
}

export async function upsertDelegate(input: {
  analystEmail: string;
  piEmail: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return { ok: false, error: "Sign in to grant access." };
  const analystEmail = normalizeDelegateEmail(input.analystEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(analystEmail)) {
    return { ok: false, error: "Enter the analyst's full email address." };
  }
  if (analystEmail === normalizeDelegateEmail(input.piEmail)) {
    return { ok: false, error: "That's your own email — you already have full access." };
  }
  const { error } = await supabase.from("workspace_delegates").upsert(
    {
      pi_user_id: userId,
      pi_email: normalizeDelegateEmail(input.piEmail),
      analyst_email: analystEmail,
      created_at: new Date().toISOString(),
    },
    { onConflict: "pi_user_id,analyst_email" }
  );
  if (error) {
    console.warn("[supabase] upsert delegate failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteDelegate(analystEmail: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("workspace_delegates")
    .delete()
    .eq("pi_user_id", userId)
    .eq("analyst_email", normalizeDelegateEmail(analystEmail));
  if (error) console.warn("[supabase] delete delegate failed:", error.message);
}
