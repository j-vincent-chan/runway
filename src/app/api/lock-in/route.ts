import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  changeSummarySentences,
  type ChangeRequestDetails,
} from "@/lib/projections/changeSummary";

export const runtime = "nodejs";

/**
 * Sends the Lock In notification email for an existing change_requests row.
 *
 * Authorization is RLS, not code: the request row is read with the caller's
 * own Supabase access token, so only the PI or a delegated analyst can see it
 * — anyone else gets "not found". The Resend key never reaches the client.
 *
 * The row and image already exist before this is called; an email failure is
 * retryable from the Status page and never loses the request.
 */

type LockInBody = { requestId?: string };

function serverError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.LOCKIN_FROM_EMAIL?.trim();
  if (!url || !key) return serverError("Cloud sync is not configured on the server.", 500);
  if (!resendKey || !fromEmail) {
    return serverError(
      "Email is not configured — set RESEND_API_KEY and LOCKIN_FROM_EMAIL.",
      500
    );
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return serverError("Sign in to send the handoff email.", 401);

  let body: LockInBody;
  try {
    body = (await request.json()) as LockInBody;
  } catch {
    return serverError("Malformed request.", 400);
  }
  if (!body.requestId) return serverError("requestId is required.", 400);

  // Per-request client carrying the caller's token, so every read below runs
  // under their RLS — this is the authorization check.
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return serverError("Your session has expired — sign in again.", 401);

  const { data: row, error: rowError } = await supabase
    .from("change_requests")
    .select("id, pi_user_id, person_name, details, image_paths, created_by_email")
    .eq("id", body.requestId)
    .maybeSingle();
  if (rowError || !row) return serverError("That request was not found.", 404);

  const { data: delegates, error: delegatesError } = await supabase
    .from("workspace_delegates")
    .select("analyst_email")
    .eq("pi_user_id", row.pi_user_id);
  if (delegatesError) return serverError("Could not look up the analysts to notify.", 500);
  const recipients = (delegates ?? []).map((d) => d.analyst_email as string).filter(Boolean);
  if (recipients.length === 0) {
    return serverError(
      "No analyst has access yet — grant access in Settings → Privacy & sync first.",
      422
    );
  }

  const attachments: { filename: string; content: string }[] = [];
  for (const path of (row.image_paths as string[] | null) ?? []) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from("app-workspace")
      .download(path);
    if (downloadError || !blob) continue; // image is a convenience; the summary text stands alone
    const buffer = Buffer.from(await blob.arrayBuffer());
    attachments.push({
      filename: `distribution-${row.person_name.replace(/[^a-zA-Z0-9-]+/g, "-")}.png`,
      content: buffer.toString("base64"),
    });
  }

  const details = row.details as ChangeRequestDetails;
  const sentences = changeSummarySentences(details);
  const requestedBy = row.created_by_email as string;
  const lines =
    sentences.length > 0
      ? sentences
      : ["The captured plan matched the current distribution when it was submitted."];

  const text = [
    `${requestedBy} locked in a distribution change for ${row.person_name} in Runway.`,
    "",
    "Requested change (current → requested percent effort):",
    ...lines.map((s) => `  • ${s}`),
    "",
    "The attached image shows the same change by month. Track and update this request's status on Runway's Status page.",
    "These are planned figures from Runway, not payroll system of record data — confirm before entry.",
  ].join("\n");

  const html = [
    `<p><strong>${escapeHtml(requestedBy)}</strong> locked in a distribution change for <strong>${escapeHtml(row.person_name)}</strong> in Runway.</p>`,
    `<p>Requested change (current → requested percent effort):</p>`,
    `<ul>${lines.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`,
    `<p>The attached image shows the same change by month. Track and update this request's status on Runway's Status page.</p>`,
    `<p style="color:#6B7690;font-size:12px">These are planned figures from Runway, not payroll system of record data — confirm before entry.</p>`,
  ].join("");

  const resend = new Resend(resendKey);
  const { error: sendError } = await resend.emails.send({
    from: fromEmail,
    to: recipients,
    subject: `Distribution change for ${row.person_name}`,
    text,
    html,
    attachments,
  });
  if (sendError) {
    return serverError(`The email could not be sent: ${sendError.message}`, 502);
  }

  const emailSentAt = new Date().toISOString();
  // Clearing digest_queued_at is what keeps the morning digest from
  // repeating a request that was just sent directly.
  const { error: markError } = await supabase
    .from("change_requests")
    .update({ email_sent_at: emailSentAt, digest_queued_at: null })
    .eq("id", row.id);
  if (markError) {
    console.warn("[lock-in] email sent but email_sent_at not recorded:", markError.message);
  }

  return NextResponse.json({ ok: true, recipients, emailSentAt });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
