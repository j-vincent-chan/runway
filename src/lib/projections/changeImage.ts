import type { ChangeRequestDetails, ChangeSummaryLine } from "@/lib/projections/changeSummary";
import { formatMonthLabel } from "@/lib/projections/horizon";

/**
 * Renders a Lock In's change summary as a self-contained SVG — the image the
 * analyst receives by email and the preview shown before submitting. Pure
 * string building so it is node-testable; rasterization lives in
 * changeImagePng.ts (browser-only).
 *
 * Colors are the light-theme design tokens as literals: an emailed image has
 * no CSS variables, and email clients render on white.
 */
const INK = "#0F1A2B";
const INK_2 = "#38445C";
const MUTED = "#6B7690";
const RULE = "#DCE0E9";
const ACCENT = "#12626E";
const INSET = "#F9FAFC";
const SURFACE = "#FFFFFF";

const SANS = "'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, Menlo, Consolas, monospace";

const LABEL_COL = 220;
const MONTH_COL = 96;
const ROW_H = 40;
const PAD = 20;
const HEADER_H = 64;
const COL_HEADER_H = 26;
const FOOTER_H = 30;

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}%`;
}

function monthAxis(lines: ChangeSummaryLine[]): string[] {
  const months = new Set<string>();
  for (const line of lines) for (const cell of line.months) months.add(cell.month);
  return [...months].sort();
}

export function renderChangeSummarySvg(
  details: ChangeRequestDetails,
  opts?: { maxMonths?: number }
): { svg: string; width: number; height: number } {
  const months = monthAxis(details.lines).slice(0, opts?.maxMonths ?? 12);
  const capturedOn = details.capturedAt.slice(0, 10);

  if (details.lines.length === 0 || months.length === 0) {
    const width = 560;
    const height = 120;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="${SURFACE}" stroke="${RULE}"/>` +
      `<text x="${PAD}" y="46" font-family="${SANS}" font-size="18" font-weight="600" fill="${INK}">${esc(details.personName)}</text>` +
      `<text x="${PAD}" y="74" font-family="${SANS}" font-size="13" fill="${INK_2}">No distribution changes captured — the plan matched the current distribution.</text>` +
      `<text x="${PAD}" y="98" font-family="${MONO}" font-size="11" fill="${MUTED}">captured ${esc(capturedOn)}</text>` +
      `</svg>`;
    return { svg, width, height };
  }

  const width = PAD * 2 + LABEL_COL + months.length * MONTH_COL;
  const gridTop = PAD + HEADER_H + COL_HEADER_H;
  const height = gridTop + details.lines.length * ROW_H + FOOTER_H + PAD;
  const gridLeft = PAD + LABEL_COL;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(
    `<defs><pattern id="proj-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">` +
      `<rect width="6" height="6" fill="${INSET}"/>` +
      `<line x1="0" y1="0" x2="0" y2="6" stroke="${RULE}" stroke-width="1.5"/>` +
      `</pattern></defs>`
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${SURFACE}"/>`);

  // Header
  parts.push(
    `<text x="${PAD}" y="${PAD + 22}" font-family="${SANS}" font-size="20" font-weight="600" fill="${INK}">${esc(details.personName)}</text>`
  );
  parts.push(
    `<text x="${PAD}" y="${PAD + 44}" font-family="${SANS}" font-size="13" fill="${INK_2}">Requested distribution change — current → requested percent effort by month</text>`
  );
  parts.push(
    `<text x="${width - PAD}" y="${PAD + 22}" text-anchor="end" font-family="${MONO}" font-size="11" fill="${MUTED}">captured ${esc(capturedOn)}</text>`
  );

  // Month column headers
  months.forEach((month, i) => {
    const cx = gridLeft + i * MONTH_COL + MONTH_COL / 2;
    parts.push(
      `<text x="${cx}" y="${gridTop - 8}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${MUTED}">${esc(formatMonthLabel(month))}</text>`
    );
  });

  // Rows
  details.lines.forEach((line, r) => {
    const y = gridTop + r * ROW_H;
    parts.push(
      `<line x1="${PAD}" y1="${y}" x2="${width - PAD}" y2="${y}" stroke="${RULE}" stroke-width="1"/>`
    );
    parts.push(
      `<text x="${PAD}" y="${y + ROW_H / 2 + 4}" font-family="${SANS}" font-size="13" font-weight="500" fill="${INK}">${esc(truncate(line.accountLabel, 30))}</text>`
    );
    const byMonth = new Map(line.months.map((c) => [c.month, c]));
    months.forEach((month, i) => {
      const x = gridLeft + i * MONTH_COL;
      const cell = byMonth.get(month);
      // Every cell in this image is a projected month — hatch the ground so
      // the convention survives forwarding, greyscale, and print.
      parts.push(
        `<rect x="${x}" y="${y}" width="${MONTH_COL}" height="${ROW_H}" fill="url(#proj-hatch)" stroke="${RULE}" stroke-width="0.5" stroke-dasharray="2,2"/>`
      );
      if (cell) {
        const cx = x + MONTH_COL / 2;
        parts.push(
          `<text x="${cx}" y="${y + 17}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${MUTED}">${esc(formatPct(cell.beforePercent))} →</text>`
        );
        parts.push(
          `<text x="${cx}" y="${y + 32}" text-anchor="middle" font-family="${MONO}" font-size="12" font-weight="600" fill="${ACCENT}">${esc(formatPct(cell.afterPercent))}</text>`
        );
      }
    });
  });

  const gridBottom = gridTop + details.lines.length * ROW_H;
  parts.push(
    `<line x1="${PAD}" y1="${gridBottom}" x2="${width - PAD}" y2="${gridBottom}" stroke="${RULE}" stroke-width="1"/>`
  );
  parts.push(
    `<text x="${PAD}" y="${gridBottom + 20}" font-family="${MONO}" font-size="11" fill="${MUTED}">Hatched cells are projected months — planned values, not payroll history. Blank cells: no change requested.</text>`
  );
  parts.push(`</svg>`);
  return { svg: parts.join(""), width, height };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
