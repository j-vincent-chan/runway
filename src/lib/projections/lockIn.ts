import type { ChangeRequestDetails } from "@/lib/projections/changeSummary";
import { renderChangeSummarySvg } from "@/lib/projections/changeImage";
import { svgToPngBlob } from "@/lib/projections/changeImagePng";
import {
  insertChangeRequest,
  reviseChangeRequest,
  type ChangeRequestRecord,
} from "@/lib/supabase/changeRequests";
import { getSupabase } from "@/lib/supabase/client";
import { WORKSPACE_STORAGE_BUCKET } from "@/lib/supabase/workspace";

export type LockInResult =
  | { ok: true; requestId: string; mode: "new" | "revised" }
  | { ok: false; error: string };

/**
 * The formal handoff — now a queued one. Locking in persists the request
 * (row + image + revision) and queues it for the next morning digest; no
 * email is sent here. The overnight gap is deliberate: it batches a day's
 * worth of changes into one analyst email and gives the PI until the digest
 * hour to unlock, correct, and re-lock.
 *
 * If the person already has an open request, this revises it in place (the
 * caller is responsible for confirming first when that request is
 * in_progress — see LockInDialog).
 */
export async function submitLockIn(input: {
  details: ChangeRequestDetails;
  piUserId: string;
  createdByEmail: string;
  /** The person's open request, if any — fetched by the dialog on mount. */
  existing: ChangeRequestRecord | null;
}): Promise<LockInResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };

  // change_requests.id is a Postgres uuid column — generateId()'s
  // timestamp-plus-random string (used for entities living in the workspace
  // JSON blob) doesn't satisfy that type.
  const requestId = input.existing?.id ?? crypto.randomUUID();
  const revisionNumber = (input.existing?.revisionCount ?? 0) + 1;
  const imagePaths: string[] = [];

  try {
    const { svg, width, height } = renderChangeSummarySvg(input.details);
    const png = await svgToPngBlob(svg, width, height);
    // Per-revision path, so the audit trail keeps every version's image
    // rather than overwriting the one the analyst may have been sent.
    const path = `${input.piUserId}/change-requests/${requestId}-r${revisionNumber}.png`;
    const { error: uploadError } = await supabase.storage
      .from(WORKSPACE_STORAGE_BUCKET)
      .upload(path, png, { contentType: "image/png", upsert: true, cacheControl: "0" });
    if (uploadError) {
      console.warn("[lock-in] image upload failed:", uploadError.message);
      // The summary text stands alone; the request still goes through.
    } else {
      imagePaths.push(path);
    }
  } catch (err) {
    console.warn("[lock-in] image render failed:", err);
  }

  if (input.existing) {
    const revised = await reviseChangeRequest({
      request: input.existing,
      details: input.details,
      imagePaths,
      byEmail: input.createdByEmail,
    });
    if (!revised.ok) {
      return { ok: false, error: revised.error ?? "The request could not be updated." };
    }
    return { ok: true, requestId, mode: "revised" };
  }

  const inserted = await insertChangeRequest({
    id: requestId,
    piUserId: input.piUserId,
    details: input.details,
    imagePaths,
    createdByEmail: input.createdByEmail,
  });
  if (!inserted.ok) {
    return { ok: false, error: inserted.error ?? "The request could not be saved." };
  }
  return { ok: true, requestId, mode: "new" };
}

/**
 * The immediate-send escape hatch ("Send now" on Status, and the retry for
 * a failed digest). Emails one request on its own and takes it out of the
 * digest queue server-side, so the morning summary doesn't repeat it.
 */
export async function sendLockInEmail(
  requestId: string
): Promise<{ emailOk: boolean; emailError?: string; recipients?: string[] }> {
  const supabase = getSupabase();
  if (!supabase) return { emailOk: false, emailError: "Cloud sync is not configured." };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { emailOk: false, emailError: "Sign in again to send the email." };

  try {
    const response = await fetch("/api/lock-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requestId }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      recipients?: string[];
    };
    if (!response.ok || !payload.ok) {
      return { emailOk: false, emailError: payload.error ?? "The email could not be sent." };
    }
    return { emailOk: true, recipients: payload.recipients };
  } catch {
    return { emailOk: false, emailError: "The email could not be sent — check your connection." };
  }
}
