import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  changeSummarySentences,
  type ChangeRequestDetails,
} from "@/lib/projections/changeSummary";
import {
  DIGEST_HOUR_DEFAULT,
  DIGEST_TZ_DEFAULT,
  digestCutoff,
} from "@/lib/digest/window";
import {
  composeDigestEmail,
  type DigestItem,
  type DigestPiSection,
} from "@/lib/digest/compose";

export const runtime = "nodejs";

/**
 * The morning digest — run hourly by cron. Everything queued before today's
 * digest hour (8:00 AM analyst-local by default) goes out as one email per
 * analyst, sectioned per PI; a failed send simply stays queued for the next
 * hourly run. Before the digest hour the run is a no-op.
 *
 * This is the one route that runs without a signed-in caller, so it uses the
 * service-role key and is guarded by CRON_SECRET instead of RLS. It reads
 * requests and delegates and clears digest flags — nothing else.
 */

type RequestRow = {
  id: string;
  pi_user_id: string;
  person_name: string;
  details: ChangeRequestDetails;
  image_paths: string[] | null;
  status: string;
  created_at: string;
  email_sent_at: string | null;
  digest_queued_at: string;
  revised_while_in_progress: boolean;
};

function kindOf(row: RequestRow): DigestItem["kind"] {
  if (row.status === "withdrawn") return "withdrawn";
  return row.email_sent_at ? "updated" : "new";
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.LOCKIN_FROM_EMAIL?.trim();
  if (!url || !serviceKey || !resendKey || !fromEmail) {
    return NextResponse.json(
      { ok: false, error: "Digest is not configured (Supabase service key, Resend, or from address missing)." },
      { status: 500 }
    );
  }

  const tz = process.env.DIGEST_TZ?.trim() || DIGEST_TZ_DEFAULT;
  const hour = Number(process.env.DIGEST_HOUR?.trim() || DIGEST_HOUR_DEFAULT);
  const now = new Date();
  const cutoff = digestCutoff(now, tz, hour);
  if (!cutoff) {
    return NextResponse.json({ ok: true, skipped: "before-digest-hour" });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: dueRows, error: dueError } = await supabase
    .from("change_requests")
    .select(
      "id, pi_user_id, person_name, details, image_paths, status, created_at, email_sent_at, digest_queued_at, revised_while_in_progress"
    )
    .not("digest_queued_at", "is", null)
    .eq("on_hold", false)
    .lt("digest_queued_at", cutoff.toISOString())
    .order("created_at", { ascending: true });
  if (dueError) {
    return NextResponse.json({ ok: false, error: dueError.message }, { status: 500 });
  }
  const due = (dueRows ?? []) as RequestRow[];
  if (due.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "nothing-queued" });
  }

  const piIds = [...new Set(due.map((r) => r.pi_user_id))];

  // Analysts per PI. A PI with no delegates keeps their rows queued — the
  // Lock In dialog already warned them nothing can be emailed.
  const { data: delegateRows, error: delegatesError } = await supabase
    .from("workspace_delegates")
    .select("pi_user_id, analyst_email")
    .in("pi_user_id", piIds);
  if (delegatesError) {
    return NextResponse.json({ ok: false, error: delegatesError.message }, { status: 500 });
  }
  const analystsByPi = new Map<string, string[]>();
  for (const d of delegateRows ?? []) {
    const list = analystsByPi.get(d.pi_user_id) ?? [];
    if (d.analyst_email) list.push(d.analyst_email);
    analystsByPi.set(d.pi_user_id, list);
  }

  // Backlog per PI: already-sent, still-open requests that are NOT in this
  // digest, so the analyst sees what's still waiting without another email.
  const { data: openRows } = await supabase
    .from("change_requests")
    .select("pi_user_id, created_at, digest_queued_at")
    .in("pi_user_id", piIds)
    .in("status", ["pending", "in_progress"])
    .is("digest_queued_at", null);

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dateLabel = dateFmt.format(now);

  // PI display: their account email, fetched via the admin API; falls back
  // to the request creator's email if lookup fails.
  const piEmailById = new Map<string, string>();
  for (const piId of piIds) {
    const { data } = await supabase.auth.admin.getUserById(piId);
    if (data?.user?.email) piEmailById.set(piId, data.user.email);
  }

  const sectionByPi = new Map<string, DigestPiSection>();
  for (const piId of piIds) {
    const rows = due.filter((r) => r.pi_user_id === piId);
    const items: DigestItem[] = rows.map((r) => ({
      personName: r.person_name,
      kind: kindOf(r),
      sentences: changeSummarySentences(r.details),
      revisedWhileInProgress: r.revised_while_in_progress || undefined,
    }));
    const open = (openRows ?? []).filter((o) => o.pi_user_id === piId);
    const oldest = open.reduce<string | null>(
      (a, o) => (a === null || o.created_at < a ? o.created_at : a),
      null
    );
    sectionByPi.set(piId, {
      piEmail:
        piEmailById.get(piId) ?? rows[0]?.details.personName ?? "your PI",
      items,
      backlog: oldest ? { openCount: open.length, oldestSubmitted: dateFmt.format(new Date(oldest)) } : null,
    });
  }

  // One email per analyst, covering every PI they serve that has items due.
  const pisByAnalyst = new Map<string, string[]>();
  for (const piId of piIds) {
    for (const analyst of analystsByPi.get(piId) ?? []) {
      const list = pisByAnalyst.get(analyst) ?? [];
      list.push(piId);
      pisByAnalyst.set(analyst, list);
    }
  }

  const resend = new Resend(resendKey);
  const failedPis = new Set<string>();
  const sentToByPi = new Map<string, string[]>();

  for (const [analyst, analystPiIds] of pisByAnalyst) {
    const sections = analystPiIds
      .map((id) => sectionByPi.get(id))
      .filter((s): s is DigestPiSection => Boolean(s));
    const { subject, text, html } = composeDigestEmail(sections, dateLabel);

    // Latest image per actionable item; withdrawn requests need none.
    const attachments: { filename: string; content: string }[] = [];
    for (const piId of analystPiIds) {
      for (const row of due.filter((r) => r.pi_user_id === piId && r.status !== "withdrawn")) {
        const path = (row.image_paths ?? [])[0];
        if (!path) continue;
        const { data: blob } = await supabase.storage.from("app-workspace").download(path);
        if (!blob) continue;
        attachments.push({
          filename: `distribution-${row.person_name.replace(/[^a-zA-Z0-9-]+/g, "-")}.png`,
          content: Buffer.from(await blob.arrayBuffer()).toString("base64"),
        });
      }
    }

    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: analyst,
      subject,
      text,
      html,
      attachments,
    });
    if (sendError) {
      for (const piId of analystPiIds) failedPis.add(piId);
    } else {
      for (const piId of analystPiIds) {
        const list = sentToByPi.get(piId) ?? [];
        list.push(analyst);
        sentToByPi.set(piId, list);
      }
    }
  }

  // A PI's rows are cleared only when every analyst covering them got the
  // email; a partial failure leaves them queued so the next hourly run
  // retries (the doubled email to the analyst who did get it is the lesser
  // harm than a silent gap for the one who didn't).
  const sentAt = new Date().toISOString();
  let cleared = 0;
  for (const piId of piIds) {
    if (failedPis.has(piId)) continue;
    if ((analystsByPi.get(piId) ?? []).length === 0) continue;
    const ids = due.filter((r) => r.pi_user_id === piId).map((r) => r.id);
    const { error: clearError } = await supabase
      .from("change_requests")
      .update({
        digest_queued_at: null,
        email_sent_at: sentAt,
        revised_while_in_progress: false,
      })
      .in("id", ids);
    if (!clearError) cleared += ids.length;
  }

  return NextResponse.json({
    ok: failedPis.size === 0,
    sent: cleared,
    analystsEmailed: [...pisByAnalyst.keys()].length,
    failedPis: failedPis.size,
  });
}
