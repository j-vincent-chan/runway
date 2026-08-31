import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";

/**
 * Transactional emails for the delegation-request flow. Like /api/lock-in,
 * authorization is RLS, not code: the request row is read with the caller's
 * own token, so "request" works only for the analyst who created it and
 * "approved" only for someone who can see the row (the PI). The route never
 * reveals whether an address has an account, and approval itself happens
 * only in the app — this email carries no approve link.
 */

type Body = { requestId?: string; kind?: "request" | "approved" };

function serverError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.LOCKIN_FROM_EMAIL?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://runway.vercel.app";
  if (!url || !key) return serverError("Cloud sync is not configured on the server.", 500);
  if (!resendKey || !fromEmail) {
    return serverError("Email is not configured — set RESEND_API_KEY and LOCKIN_FROM_EMAIL.", 500);
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return serverError("Sign in first.", 401);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return serverError("Malformed request.", 400);
  }
  if (!body.requestId || !body.kind) return serverError("requestId and kind are required.", 400);

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return serverError("Your session has expired — sign in again.", 401);

  const { data: row, error: rowError } = await supabase
    .from("delegation_requests")
    .select("id, analyst_email, analyst_name, pi_email, status, note")
    .eq("id", body.requestId)
    .maybeSingle();
  if (rowError || !row) return serverError("That request was not found.", 404);

  const analystLabel = row.analyst_name
    ? `${row.analyst_name} (${row.analyst_email})`
    : row.analyst_email;
  const settingsUrl = `${appUrl}/settings`;
  const resend = new Resend(resendKey);

  if (body.kind === "request") {
    if (row.status !== "pending") return serverError("That request is no longer pending.", 409);
    const note = (row.note ?? "").trim();
    const text = [
      `${analystLabel} is requesting access to your Runway workspace as a financial analyst.`,
      ...(note ? ["", `Their note: "${note}"`] : []),
      "",
      "Approving gives them the same view and edit access you have, until you remove them.",
      `Review and approve or decline in Runway: ${settingsUrl}`,
      "",
      "If you don't recognize this person, decline the request — no access exists until you approve.",
      "New to Runway? This request also works as your invitation: create an account with this email address and the request will be waiting in Settings.",
    ].join("\n");
    const html = [
      `<p><strong>${escapeHtml(analystLabel)}</strong> is requesting access to your Runway workspace as a financial analyst.</p>`,
      note ? `<p>Their note: &ldquo;${escapeHtml(note)}&rdquo;</p>` : "",
      `<p>Approving gives them the same view and edit access you have, until you remove them.</p>`,
      `<p><a href="${settingsUrl}">Review and approve or decline in Runway</a>.</p>`,
      `<p style="color:#6B7690;font-size:12px">If you don't recognize this person, decline the request — no access exists until you approve. New to Runway? Create an account with this email address and the request will be waiting in Settings.</p>`,
    ].join("");
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: row.pi_email,
      subject: `${row.analyst_name || row.analyst_email} requests access to your Runway workspace`,
      text,
      html,
    });
    if (sendError) return serverError(`The email could not be sent: ${sendError.message}`, 502);
    return NextResponse.json({ ok: true });
  }

  // kind === "approved" — tell the analyst they're in.
  if (row.status !== "approved") return serverError("That request is not approved.", 409);
  const text = [
    `${row.pi_email} approved your access request in Runway.`,
    "",
    `Open Runway and pick their workspace from the selector in the header: ${appUrl}`,
  ].join("\n");
  const html = [
    `<p><strong>${escapeHtml(row.pi_email)}</strong> approved your access request in Runway.</p>`,
    `<p><a href="${appUrl}">Open Runway</a> and pick their workspace from the selector in the header.</p>`,
  ].join("");
  const { error: sendError } = await resend.emails.send({
    from: fromEmail,
    to: row.analyst_email,
    subject: `${row.pi_email} approved your Runway access`,
    text,
    html,
  });
  if (sendError) return serverError(`The email could not be sent: ${sendError.message}`, 502);
  return NextResponse.json({ ok: true });
}
