import { escapeHtml } from "./html";
import { emailParagraph, renderEmail } from "./layout";
import { firstNameOf } from "@/lib/supabase/profiles";

/**
 * The delegation-flow emails, pure text-in text-out (the /api/delegation-email
 * route fetches the row and sends). Security stance is inherited and kept:
 * the request email links only to Settings — approval happens in the app,
 * never from a link in an email.
 */
export type ComposedEmail = { subject: string; text: string; html: string };

export function composeDelegationRequestEmail(input: {
  analystName: string;
  analystEmail: string;
  note: string;
  appUrl: string;
}): ComposedEmail {
  const { analystName, analystEmail, appUrl } = input;
  const note = input.note.trim();
  const analystLabel = analystName ? `${analystName} (${analystEmail})` : analystEmail;
  const settingsUrl = `${appUrl}/settings`;

  const subject = `${analystName || analystEmail} requests access to your Runway workspace`;

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

  const { html } = renderEmail({
    preheader:
      "Approving gives them the same view and edit access you have — review in Settings.",
    bodyHtml: [
      emailParagraph(
        `<strong>${escapeHtml(analystLabel)}</strong> is requesting access to your Runway workspace as a financial analyst.`
      ),
      note ? emailParagraph(`Their note: &ldquo;${escapeHtml(note)}&rdquo;`) : "",
      emailParagraph(
        "Approving gives them the same view and edit access you have, until you remove them."
      ),
    ].join(""),
    cta: { label: "Review request in Settings", url: settingsUrl },
    footnoteHtml:
      "If you don't recognize this person, decline the request — no access exists until you approve. New to Runway? Create an account with this email address and the request will be waiting in Settings.",
    receivingReason: `You're receiving this because ${escapeHtml(analystEmail)} entered your address in a Runway access request.`,
  });

  return { subject, text, html };
}

export function composeDelegationApprovedEmail(input: {
  piEmail: string;
  analystName: string;
  appUrl: string;
}): ComposedEmail {
  const { piEmail, analystName, appUrl } = input;
  const firstName = firstNameOf(analystName);

  const subject = `${piEmail} approved your Runway access`;

  const text = [
    `${piEmail} approved your access request in Runway.`,
    "",
    `Their workspace is ready for you — open Runway to start: ${appUrl}`,
  ].join("\n");

  const { html } = renderEmail({
    preheader: "Their workspace is ready for you in Runway.",
    greeting: firstName ? `Hi ${firstName},` : undefined,
    bodyHtml: emailParagraph(
      `<strong>${escapeHtml(piEmail)}</strong> approved your access request. Their workspace is ready for you in Runway.`
    ),
    cta: { label: "Open Runway", url: appUrl },
    receivingReason: "You're receiving this because you requested access to this workspace in Runway.",
  });

  return { subject, text, html };
}
