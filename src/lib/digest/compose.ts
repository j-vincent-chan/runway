/**
 * Composes the analyst's morning digest — one email per analyst per morning,
 * a section per PI, items grouped New / Updated / Withdrawn. Pure text in,
 * text out, so the whole email is testable without Supabase or Resend.
 */
import { escapeHtml } from "@/lib/email/html";
import { emailDataList, emailParagraph, renderEmail } from "@/lib/email/layout";
import { INK, INK_2, MUTED, SANS } from "@/lib/email/tokens";

export type DigestItemKind = "new" | "updated" | "withdrawn";

export type DigestItem = {
  personName: string;
  kind: DigestItemKind;
  /** changeSummarySentences() output — already reader-ready. */
  sentences: string[];
  /** Set when the analyst had started the request before it was revised. */
  revisedWhileInProgress?: boolean;
};

export type DigestPiSection = {
  /** Who the requests belong to — the workspace owner the analyst serves. */
  piEmail: string;
  items: DigestItem[];
  /** Older requests already sent and still open, so backlog stays visible. */
  backlog: { openCount: number; oldestSubmitted: string } | null;
};

const KIND_LABEL: Record<DigestItemKind, string> = {
  new: "New",
  updated: "Updated",
  withdrawn: "Withdrawn — no action needed",
};

const KIND_ORDER: DigestItemKind[] = ["new", "updated", "withdrawn"];

function countByKind(sections: DigestPiSection[]): Record<DigestItemKind, number> {
  const counts: Record<DigestItemKind, number> = { new: 0, updated: 0, withdrawn: 0 };
  for (const s of sections) for (const item of s.items) counts[item.kind] += 1;
  return counts;
}

/** "2 new requests and 1 update" — singular, plural, and zero all handled. */
export function digestSubjectSummary(sections: DigestPiSection[]): string {
  const counts = countByKind(sections);
  const parts: string[] = [];
  if (counts.new > 0) parts.push(`${counts.new} new request${counts.new === 1 ? "" : "s"}`);
  if (counts.updated > 0) parts.push(`${counts.updated} update${counts.updated === 1 ? "" : "s"}`);
  if (counts.withdrawn > 0)
    parts.push(`${counts.withdrawn} withdrawal${counts.withdrawn === 1 ? "" : "s"}`);
  if (parts.length === 0) return "no changes";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}

export function composeDigestEmail(
  sections: DigestPiSection[],
  dateLabel: string,
  appUrl: string
): { subject: string; text: string; html: string } {
  const subject = `Runway distribution changes — ${digestSubjectSummary(sections)} (${dateLabel})`;
  const statusUrl = `${appUrl}/status`;

  const textLines: string[] = [
    `Your Runway morning summary for ${dateLabel}.`,
    "",
  ];
  const htmlParts: string[] = [
    emailParagraph(
      `Your Runway morning summary for <strong>${escapeHtml(dateLabel)}</strong>.`
    ),
  ];

  for (const section of sections) {
    textLines.push(`Requests from ${section.piEmail}:`);
    htmlParts.push(
      `<h3 style="margin:20px 0 4px;font-family:${SANS};font-size:16px;line-height:22px;font-weight:600;color:${INK}">Requests from ${escapeHtml(section.piEmail)}</h3>`
    );

    for (const kind of KIND_ORDER) {
      const items = section.items.filter((i) => i.kind === kind);
      if (items.length === 0) continue;
      textLines.push(`  ${KIND_LABEL[kind]}:`);
      htmlParts.push(
        `<p style="margin:8px 0 2px;font-family:${SANS};font-size:14px;line-height:20px;font-weight:600;color:${INK_2}">${KIND_LABEL[kind]}</p><ul style="margin:0 0 8px;padding-left:20px">`
      );
      for (const item of items) {
        const flag = item.revisedWhileInProgress
          ? " — revised while you had it in progress; the version below replaces what you were working from"
          : "";
        textLines.push(`    • ${item.personName}${flag}`);
        htmlParts.push(
          `<li style="margin:0 0 4px;font-family:${SANS};font-size:14px;line-height:20px;color:${INK}"><strong>${escapeHtml(item.personName)}</strong>${escapeHtml(flag)}`
        );
        if (item.kind !== "withdrawn") {
          for (const s of item.sentences) textLines.push(`        ${s}`);
          if (item.sentences.length > 0)
            htmlParts.push(emailDataList(item.sentences.map((s) => escapeHtml(s))));
        }
        htmlParts.push(`</li>`);
      }
      htmlParts.push(`</ul>`);
    }

    if (section.backlog && section.backlog.openCount > 0) {
      const n = section.backlog.openCount;
      const line = `${n} earlier request${n === 1 ? "" : "s"} from this PI ${
        n === 1 ? "is" : "are"
      } still open, oldest submitted ${section.backlog.oldestSubmitted}.`;
      textLines.push(`  ${line}`);
      htmlParts.push(
        `<p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:19px;color:${MUTED}">${escapeHtml(line)}</p>`
      );
    }
    textLines.push("");
  }

  textLines.push(
    "Attached images show each change by month. Track and update request status on Runway's Status page.",
    `Track it here: ${statusUrl}`,
    "These are planned figures from Runway, not payroll system of record data — confirm before entry."
  );
  htmlParts.push(
    emailParagraph(
      "Attached images show each change by month. Track and update request status on Runway's Status page."
    )
  );

  const { html } = renderEmail({
    preheader: `${digestSubjectSummary(sections)} across your PI workspaces.`,
    bodyHtml: htmlParts.join(""),
    cta: { label: "Open the Status page", url: statusUrl },
    footnoteHtml:
      "These are planned figures from Runway, not payroll system of record data — confirm before entry.",
    receivingReason:
      "You're receiving this because you're a delegated analyst on a Runway workspace. This summary is sent each morning there are queued changes; a PI removing your access ends it.",
  });

  return { subject, text: textLines.join("\n"), html };
}
