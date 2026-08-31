import { getSupabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/supabase/authUser";
import { normalizeDelegateEmail } from "@/lib/supabase/delegates";

/**
 * An analyst asks for access; the PI approves. Requests are inert rows —
 * approving one creates the workspace_delegates grant through the existing
 * machinery, so the access predicate itself never carries pending state.
 */
export type DelegationRequestStatus = "pending" | "approved" | "declined";

export type DelegationRequest = {
  id: string;
  analystUserId: string;
  analystEmail: string;
  analystName: string;
  piEmail: string;
  piUserId: string | null;
  status: DelegationRequestStatus;
  note: string;
  createdAt: string;
  respondedAt: string | null;
};

type RequestRow = {
  id: string;
  analyst_user_id: string;
  analyst_email: string;
  analyst_name: string;
  pi_email: string;
  pi_user_id: string | null;
  status: DelegationRequestStatus;
  note: string;
  created_at: string;
  responded_at: string | null;
};

const COLUMNS =
  "id, analyst_user_id, analyst_email, analyst_name, pi_email, pi_user_id, status, note, created_at, responded_at";

function rowToRequest(row: RequestRow): DelegationRequest {
  return {
    id: row.id,
    analystUserId: row.analyst_user_id,
    analystEmail: row.analyst_email,
    analystName: row.analyst_name,
    piEmail: row.pi_email,
    piUserId: row.pi_user_id,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

/** The requests I've made as an analyst, newest first. */
export async function fetchMyDelegationRequests(): Promise<DelegationRequest[]> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("delegation_requests")
    .select(COLUMNS)
    .eq("analyst_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[supabase] fetch my delegation requests failed:", error.message);
    return [];
  }
  return ((data ?? []) as RequestRow[]).map(rowToRequest);
}

/**
 * Pending requests naming me as the PI. Resolves email-matched requests to
 * my account first, so asks that predate my sign-up appear too.
 */
export async function fetchRequestsForMeAsPi(): Promise<DelegationRequest[]> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return [];
  const { error: resolveError } = await supabase.rpc("resolve_delegation_requests");
  if (resolveError) {
    console.warn("[supabase] resolve delegation requests failed:", resolveError.message);
  }
  const { data, error } = await supabase
    .from("delegation_requests")
    .select(COLUMNS)
    .eq("pi_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[supabase] fetch PI delegation requests failed:", error.message);
    return [];
  }
  return ((data ?? []) as RequestRow[]).map(rowToRequest);
}

export async function createDelegationRequest(input: {
  piEmail: string;
  analystEmail: string;
  analystName: string;
  note?: string;
}): Promise<{ ok: boolean; requestId?: string; error?: string; alreadyPending?: boolean }> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return { ok: false, error: "Sign in first." };
  const piEmail = normalizeDelegateEmail(input.piEmail);
  if (!piEmail || !piEmail.includes("@")) {
    return { ok: false, error: "Enter the PI's email address." };
  }
  if (piEmail === normalizeDelegateEmail(input.analystEmail)) {
    return { ok: false, error: "That's your own email — your own workspace is already yours." };
  }
  const id = crypto.randomUUID();
  const { error } = await supabase.from("delegation_requests").insert({
    id,
    analyst_user_id: userId,
    analyst_email: normalizeDelegateEmail(input.analystEmail),
    analyst_name: input.analystName.trim(),
    pi_email: piEmail,
    status: "pending",
    note: (input.note ?? "").trim(),
  });
  if (error) {
    // The partial unique index: a duplicate ask re-surfaces the pending one.
    if (error.code === "23505") return { ok: true, alreadyPending: true };
    console.warn("[supabase] create delegation request failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, requestId: id };
}

export async function respondToDelegationRequest(
  id: string,
  status: Extract<DelegationRequestStatus, "approved" | "declined">
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const { error } = await supabase
    .from("delegation_requests")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    console.warn("[supabase] respond to delegation request failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Cancel my own pending ask. */
export async function cancelDelegationRequest(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const { error } = await supabase
    .from("delegation_requests")
    .delete()
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    console.warn("[supabase] cancel delegation request failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
