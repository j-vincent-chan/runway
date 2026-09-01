import { escapeHtml } from "./html";
import { emailDataList, emailParagraph, renderEmail } from "./layout";
import type { ComposedEmail } from "./composeDelegation";

/**
 * The Lock In handoff email, pure text-in text-out. The change sentences
 * arrive pre-built from changeSummarySentences — this module never derives
 * a figure of its own.
 */
export function composeLockInEmail(input: {
  requestedBy: string;
  personName: string;
  sentences: string[];
  appUrl: string;
}): ComposedEmail {
  const { requestedBy, personName, appUrl } = input;
  const statusUrl = `${appUrl}/status`;
  const lines =
    input.sentences.length > 0
      ? input.sentences
      : ["The captured plan matched the current distribution when it was submitted."];

  const subject = `Distribution change for ${personName}`;

  const text = [
    `${requestedBy} locked in a distribution change for ${personName} in Runway.`,
    "",
    "Requested change (current → requested percent effort):",
    ...lines.map((s) => `  • ${s}`),
    "",
    "The attached image shows the same change by month. Track and update this request's status on Runway's Status page.",
    `Track it here: ${statusUrl}`,
    "These are planned figures from Runway, not payroll system of record data — confirm before entry.",
  ].join("\n");

  const { html } = renderEmail({
    preheader:
      input.sentences[0] ?? "A locked-in distribution change is ready to enter.",
    bodyHtml: [
      emailParagraph(
        `<strong>${escapeHtml(requestedBy)}</strong> locked in a distribution change for <strong>${escapeHtml(personName)}</strong> in Runway.`
      ),
      emailParagraph("Requested change (current → requested percent effort):"),
      emailDataList(lines.map((s) => escapeHtml(s))),
      emailParagraph(
        "The attached image shows the same change by month. Track and update this request's status on Runway's Status page."
      ),
    ].join(""),
    cta: { label: "Track on the Status page", url: statusUrl },
    footnoteHtml:
      "These are planned figures from Runway, not payroll system of record data — confirm before entry.",
    receivingReason:
      "You're receiving this because you're a delegated analyst on this Runway workspace.",
  });

  return { subject, text, html };
}
