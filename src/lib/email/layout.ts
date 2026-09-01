import { escapeHtml } from "./html";
import {
  ACCENT,
  ACCENT_SOFT,
  INK,
  MONO,
  MUTED,
  NAVY,
  PAPER,
  RULE,
  SANS,
  SURFACE,
} from "./tokens";

/**
 * The one layout every Runway email renders through: brand header, white
 * card on the app's paper ground, optional CTA button, small print, footer.
 * Email-client constraints shape everything here — inline styles only,
 * nested presentation tables, a single 600px column, and no <img> at all
 * (nothing is hosted, and the header must survive image blocking), so the
 * three-bars mark is rebuilt from table cells.
 */
export type RenderEmailOptions = {
  /** Inbox preview line; hidden in the rendered page. Plain text. */
  preheader: string;
  /** "Hi Priya," — omit when no name is known; never greet a stranger generically. */
  greeting?: string;
  /** Pre-escaped inner HTML from a compose function. */
  bodyHtml: string;
  /** Prominent action button. url must be absolute. */
  cta?: { label: string; url: string };
  /** Small print above the footer: figure caveats, didn't-request notes. Pre-escaped HTML. */
  footnoteHtml?: string;
  /** "You're receiving this because …" — plain text, escaped here. */
  receivingReason: string;
};

/** Sender header with the product as display name: `Runway <addr>`. */
export function emailFrom(fromAddress: string): string {
  return `Runway <${fromAddress.trim()}>`;
}

/** Body paragraph with house styling; compose functions build on these. */
export function emailParagraph(innerHtml: string): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:24px;color:${INK}">${innerHtml}</p>`;
}

/** Data-furniture list (change sentences, figures): mono, one item per line. */
export function emailDataList(itemsHtml: string[]): string {
  const items = itemsHtml
    .map(
      (item) =>
        `<li style="margin:0 0 6px;font-family:${MONO};font-size:14px;line-height:20px;color:${INK}">${item}</li>`
    )
    .join("");
  return `<ul style="margin:0 0 16px;padding-left:20px">${items}</ul>`;
}

/** One row of the three-bars mark: filled width + remaining track. */
function logoBar(filled: number): string {
  const total = 26;
  const track = total - filled;
  const cell = (width: number, color: string) =>
    width > 0
      ? `<td width="${width}" style="width:${width}px;height:5px;background-color:${color};border-radius:2px;font-size:0;line-height:0">&nbsp;</td>`
      : "";
  return `<tr>${cell(filled, ACCENT)}${track > 0 ? `<td width="2" style="width:2px;font-size:0;line-height:0">&nbsp;</td>` : ""}${cell(track > 2 ? track - 2 : 0, ACCENT_SOFT)}</tr>`;
}

function header(): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%">
    <tr>
      <td width="34" style="width:34px;vertical-align:middle" aria-hidden="true">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 3px">
          ${logoBar(26)}
          ${logoBar(17)}
          ${logoBar(9)}
        </table>
      </td>
      <td style="vertical-align:middle">
        <div style="font-family:${SANS};font-size:18px;line-height:22px;font-weight:600;color:${NAVY}">Runway</div>
        <div style="font-family:${MONO};font-size:11px;line-height:14px;letter-spacing:.11em;color:${MUTED}">PAYROLL&nbsp;PLANNER</div>
      </td>
    </tr>
  </table>`;
}

export function renderEmail(options: RenderEmailOptions): { html: string } {
  const { preheader, greeting, bodyHtml, cta, footnoteHtml, receivingReason } = options;
  if (cta && !/^https?:\/\//i.test(cta.url)) {
    throw new Error(`Email CTA url must be absolute, got: ${cta.url}`);
  }

  const greetingHtml = greeting ? emailParagraph(escapeHtml(greeting)) : "";

  const ctaHtml = cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px">
        <tr>
          <td style="border-radius:6px;background-color:${ACCENT}">
            <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const footnoteBlock = footnoteHtml
    ? `
      <tr>
        <td style="padding:16px 32px 0;border-top:1px solid ${RULE}">
          <p style="margin:0;font-family:${SANS};font-size:13px;line-height:19px;color:${MUTED}">${footnoteHtml}</p>
        </td>
      </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Runway</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER}">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${PAPER}">
    <tr>
      <td align="center" style="padding:24px 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px">
          <tr>
            <td style="padding:0 32px 16px">${header()}</td>
          </tr>
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${SURFACE};border:1px solid ${RULE};border-radius:8px">
                <tr>
                  <td style="padding:28px 32px 8px">
                    ${greetingHtml}
                    ${bodyHtml}
                    ${ctaHtml}
                  </td>
                </tr>
                ${footnoteBlock}
                <tr>
                  <td style="padding:0 0 20px"></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0">
              <p style="margin:0 0 6px;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED}">Runway — payroll planning for UCSF research programs. A planning layer, not the payroll system of record.</p>
              <p style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED}">${escapeHtml(receivingReason)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { html };
}
