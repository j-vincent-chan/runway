import type { ChangeRequestDetails } from "@/lib/projections/changeSummary";
import { renderChangeSummarySvg } from "@/lib/projections/changeImage";
import { svgToPngBlob } from "@/lib/projections/changeImagePng";
import { insertChangeRequest } from "@/lib/supabase/changeRequests";
import { getSupabase } from "@/lib/supabase/client";
import { WORKSPACE_STORAGE_BUCKET } from "@/lib/supabase/workspace";

export type LockInResult =
  | { ok: true; requestId: string; emailOk: boolean; emailError?: string; recipients?: string[] }
  | { ok: false; error: string };

/**
 * The formal handoff: persist the request (row + image) first, then ask the
 * server to email the analysts. The order is the guarantee — an email failure
 * leaves a complete request on the Status page with a retry, never a lost
 * submission.
 */
export async function submitLockIn(input: {
  details: ChangeRequestDetails;
  piUserId: string;
  createdByEmail: string;
}): Promise<LockInResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };

  // change_requests.id is a Postgres uuid column — generateId()'s
  // timestamp-plus-random string (used for entities living in the workspace
  // JSON blob) doesn't satisfy that type.
  const requestId = crypto.randomUUID();
  const imagePaths: string[] = [];

  try {
    const { svg, width, height } = renderChangeSummarySvg(input.details);
    const png = await svgToPngBlob(svg, width, height);
    const path = `${input.piUserId}/change-requests/${requestId}.png`;
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

  const email = await sendLockInEmail(requestId);
  return { ok: true, requestId, ...email };
}

/** Also the Status page's "Resend email" path. */
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
