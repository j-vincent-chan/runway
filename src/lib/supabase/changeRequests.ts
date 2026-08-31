import type { ChangeRequestDetails } from "@/lib/projections/changeSummary";
import { getSupabase } from "@/lib/supabase/client";
import { getActiveWorkspaceOwnerId } from "@/lib/supabase/activeWorkspace";

/**
 * Lock In requests live in their own table rather than the workspace blob:
 * an analyst flips a request's status while the PI keeps editing, and the
 * blob's last-write-wins debounced save would race one of them away.
 *
 * One OPEN request per person (enforced by a partial unique index): a
 * re-lock revises the open request in place and appends to the revisions
 * audit table, so the analyst always sees exactly one current ask per
 * person. `completed` and `withdrawn` close a cycle; the next Lock In for
 * that person starts a fresh row.
 */
export type ChangeRequestStatus = "pending" | "in_progress" | "completed" | "withdrawn";

/** The states the analyst can set. Withdrawn belongs to the PI's unlock flow. */
export const ANALYST_SETTABLE_STATUSES = ["pending", "in_progress", "completed"] as const;

export const CHANGE_REQUEST_STATUSES: ChangeRequestStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "withdrawn",
];

const OPEN_STATUSES: ChangeRequestStatus[] = ["pending", "in_progress"];

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
  /** Waiting for the morning digest; null once sent (or nothing queued). */
  digestQueuedAt: string | null;
  /** The PI unlocked to revise — excluded from the digest until re-locked. */
  onHold: boolean;
  revisedAt: string | null;
  revisionCount: number;
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
  digest_queued_at: string | null;
  on_hold: boolean;
  revised_at: string | null;
  revision_count: number;
};

const ROW_COLUMNS =
  "id, pi_user_id, person_key, person_name, details, image_paths, status, created_at, created_by_email, status_changed_at, status_changed_by_email, email_sent_at, digest_queued_at, on_hold, revised_at, revision_count";

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
    digestQueuedAt: row.digest_queued_at,
    onHold: row.on_hold,
    revisedAt: row.revised_at,
    revisionCount: row.revision_count,
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

/**
 * The open (pending or in-progress) request for one person, if any — the row
 * a re-lock would revise and an unlock would hold or withdraw.
 */
export async function fetchOpenRequestForPerson(
  personKey: string
): Promise<ChangeRequestRecord | null> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return null;
  const { data, error } = await supabase
    .from("change_requests")
    .select(ROW_COLUMNS)
    .eq("pi_user_id", ownerId)
    .eq("person_key", personKey)
    .in("status", OPEN_STATUSES)
    .maybeSingle();
  if (error) {
    console.warn("[supabase] fetch open request failed:", error.message);
    return null;
  }
  return data ? rowToRecord(data as unknown as ChangeRequestRow) : null;
}

async function appendRevision(input: {
  requestId: string;
  piUserId: string;
  details: ChangeRequestDetails;
  imagePaths: string[];
  createdByEmail: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("change_request_revisions").insert({
    request_id: input.requestId,
    pi_user_id: input.piUserId,
    details: input.details,
    image_paths: input.imagePaths,
    created_by_email: input.createdByEmail,
  });
  // The audit copy is a convenience on top of the request row; its failure
  // must not fail the handoff.
  if (error) console.warn("[supabase] revision insert failed:", error.message);
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
    digest_queued_at: now,
    on_hold: false,
    revision_count: 1,
  });
  if (error) {
    console.warn("[supabase] insert change request failed:", error.message);
    return { ok: false, error: error.message };
  }
  await appendRevision({
    requestId: input.id,
    piUserId: input.piUserId,
    details: input.details,
    imagePaths: input.imagePaths,
    createdByEmail: input.createdByEmail,
  });
  return { ok: true };
}

/**
 * A re-lock of a person with an open request: the row keeps its identity
 * (and the analyst's view keeps one line), the details become the new
 * version, and the digest is re-queued. An in-progress request drops back
 * to pending — the new content is new work.
 */
export async function reviseChangeRequest(input: {
  request: ChangeRequestRecord;
  details: ChangeRequestDetails;
  imagePaths: string[];
  byEmail: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("change_requests")
    .update({
      details: input.details,
      image_paths: input.imagePaths,
      status: "pending",
      status_changed_at: now,
      status_changed_by_email: input.byEmail,
      digest_queued_at: now,
      on_hold: false,
      revised_at: now,
      revision_count: input.request.revisionCount + 1,
    })
    .eq("id", input.request.id);
  if (error) {
    console.warn("[supabase] revise change request failed:", error.message);
    return { ok: false, error: error.message };
  }
  await appendRevision({
    requestId: input.request.id,
    piUserId: input.request.piUserId,
    details: input.details,
    imagePaths: input.imagePaths,
    createdByEmail: input.byEmail,
  });
  return { ok: true };
}

/**
 * Unlock-to-revise: keeps the request open but out of the digest until the
 * PI re-locks. Visible to the analyst as on hold, so a sent request being
 * revised isn't acted on in the meantime.
 */
export async function setChangeRequestHold(
  id: string,
  onHold: boolean
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const { error } = await supabase.from("change_requests").update({ on_hold: onHold }).eq("id", id);
  if (error) {
    console.warn("[supabase] hold update failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Withdraws an open request. If it was never emailed, the withdrawal is
 * silent (the queue entry just disappears); if the analyst was already
 * notified, it stays queued so the next digest says "withdrawn — no action
 * needed" instead of leaving them to act on a dead request.
 */
export async function withdrawChangeRequest(
  request: ChangeRequestRecord,
  byEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("change_requests")
    .update({
      status: "withdrawn",
      status_changed_at: now,
      status_changed_by_email: byEmail,
      on_hold: false,
      digest_queued_at: request.emailSentAt ? now : null,
    })
    .eq("id", request.id);
  if (error) {
    console.warn("[supabase] withdraw failed:", error.message);
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
