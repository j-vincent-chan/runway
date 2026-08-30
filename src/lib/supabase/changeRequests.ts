import type { ChangeRequestDetails } from "@/lib/projections/changeSummary";
import { getSupabase } from "@/lib/supabase/client";
import { getActiveWorkspaceOwnerId } from "@/lib/supabase/activeWorkspace";

/**
 * Lock In requests live in their own table rather than the workspace blob:
 * an analyst flips a request's status while the PI keeps editing, and the
 * blob's last-write-wins debounced save would race one of them away.
 */
export type ChangeRequestStatus = "pending" | "in_progress" | "completed";

export const CHANGE_REQUEST_STATUSES: ChangeRequestStatus[] = [
  "pending",
  "in_progress",
  "completed",
];

export type ChangeRequestRecord = {
  id: string;
  piUserId: string;
  personKey: string;
  personName: string;
  details: ChangeRequestDetails;
  imagePaths: string[];
  status: ChangeRequestStatus;
  createdAt: string;
  createdByEmail: string;
  statusChangedAt: string;
  statusChangedByEmail: string;
  emailSentAt: string | null;
};

type ChangeRequestRow = {
  id: string;
  pi_user_id: string;
  person_key: string;
  person_name: string;
  details: ChangeRequestDetails;
  image_paths: string[] | null;
  status: ChangeRequestStatus;
  created_at: string;
  created_by_email: string;
  status_changed_at: string;
  status_changed_by_email: string;
  email_sent_at: string | null;
};

const ROW_COLUMNS =
  "id, pi_user_id, person_key, person_name, details, image_paths, status, created_at, created_by_email, status_changed_at, status_changed_by_email, email_sent_at";

function rowToRecord(row: ChangeRequestRow): ChangeRequestRecord {
  return {
    id: row.id,
    piUserId: row.pi_user_id,
    personKey: row.person_key,
    personName: row.person_name,
    details: row.details,
    imagePaths: row.image_paths ?? [],
    status: row.status,
    createdAt: row.created_at,
    createdByEmail: row.created_by_email,
    statusChangedAt: row.status_changed_at,
    statusChangedByEmail: row.status_changed_by_email,
    emailSentAt: row.email_sent_at,
  };
}

/** Requests for the active workspace (the PI's own, or the one being delegated). */
export async function fetchChangeRequests(): Promise<ChangeRequestRecord[]> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return [];
  const { data, error } = await supabase
    .from("change_requests")
    .select(ROW_COLUMNS)
    .eq("pi_user_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[supabase] fetch change requests failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as ChangeRequestRow[]).map(rowToRecord);
}

export async function insertChangeRequest(input: {
  id: string;
  piUserId: string;
  details: ChangeRequestDetails;
  imagePaths: string[];
  createdByEmail: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const now = new Date().toISOString();
  const { error } = await supabase.from("change_requests").insert({
    id: input.id,
    pi_user_id: input.piUserId,
    person_key: input.details.personKey,
    person_name: input.details.personName,
    details: input.details,
    image_paths: input.imagePaths,
    status: "pending",
    created_at: now,
    created_by_email: input.createdByEmail,
    status_changed_at: now,
    status_changed_by_email: input.createdByEmail,
  });
  if (error) {
    console.warn("[supabase] insert change request failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateChangeRequestStatus(
  id: string,
  status: ChangeRequestStatus,
  byEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const { error } = await supabase
    .from("change_requests")
    .update({
      status,
      status_changed_at: new Date().toISOString(),
      status_changed_by_email: byEmail,
    })
    .eq("id", id);
  if (error) {
    console.warn("[supabase] update change request failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
