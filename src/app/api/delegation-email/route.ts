import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  composeDelegationApprovedEmail,
  composeDelegationRequestEmail,
} from "@/lib/email/composeDelegation";
import { emailFrom } from "@/lib/email/layout";
import { appUrlFromEnv } from "@/lib/email/url";

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

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.LOCKIN_FROM_EMAIL?.trim();
  const appUrl = appUrlFromEnv();
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

  const resend = new Resend(resendKey);

  if (body.kind === "request") {
    if (row.status !== "pending") return serverError("That request is no longer pending.", 409);
    const email = composeDelegationRequestEmail({
      analystName: row.analyst_name ?? "",
      analystEmail: row.analyst_email,
      note: row.note ?? "",
      appUrl,
    });
    const { error: sendError } = await resend.emails.send({
      from: emailFrom(fromEmail),
      to: row.pi_email,
      replyTo: row.analyst_email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    if (sendError) return serverError(`The email could not be sent: ${sendError.message}`, 502);
    return NextResponse.json({ ok: true });
  }

  // kind === "approved" — tell the analyst they're in.
  if (row.status !== "approved") return serverError("That request is not approved.", 409);
  const email = composeDelegationApprovedEmail({
    piEmail: row.pi_email,
    analystName: row.analyst_name ?? "",
    appUrl,
  });
  const { error: sendError } = await resend.emails.send({
    from: emailFrom(fromEmail),
    to: row.analyst_email,
    replyTo: row.pi_email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  if (sendError) return serverError(`The email could not be sent: ${sendError.message}`, 502);
  return NextResponse.json({ ok: true });
}
