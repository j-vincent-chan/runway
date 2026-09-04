import { roundPercentDisplay } from "@/lib/utils/parse";

export const PROJECTION_MONTH_COL_MIN = 52;
// 360, not 300: the fund rows carry eye/landmark/rule/remove buttons, the
// rename input, and the project number. At 300 the fixed parts alone summed to
// 321px, so the project number — last in the row — was clipped away entirely.
export const PROJECTION_LABEL_COL = 360;
export const PROJECTION_SCOPE_COL = 48;

export function groupMonthsByYear(months: string[]): { year: string; months: string[] }[] {
  const groups: { year: string; months: string[] }[] = [];
  for (const month of months) {
    const year = month.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last?.year === year) last.months.push(month);
    else groups.push({ year, months: [month] });
  }
  return groups;
}

export interface ProjectionSegment<T> {
  months: string[];
  colspan: number;
  value: T;
}

/** Merge consecutive months that share the same displayed percent (and optional group). */
export function mergeByPercent(
  months: string[],
  percentForMonth: (month: string) => number,
  groupForMonth?: (month: string) => string | boolean
): ProjectionSegment<number>[] {
  if (months.length === 0) return [];
  const segments: ProjectionSegment<number>[] = [];
  let i = 0;
  while (i < months.length) {
    const month = months[i]!;
    const pct = roundPercentDisplay(percentForMonth(month));
    const group = groupForMonth?.(month);
    let j = i + 1;
    while (j < months.length) {
      const next = months[j]!;
      if (roundPercentDisplay(percentForMonth(next)) !== pct) break;
      if (groupForMonth && groupForMonth(next) !== group) break;
      j++;
    }
    segments.push({ months: months.slice(i, j), colspan: j - i, value: pct });
    i = j;
  }
  return segments;
}

export function isProjectedMonth(month: string, originMonth: string): boolean {
  return month > originMonth;
}

/** Mix a hex fill toward white so projected months read lighter than origin. */
export function lightenProjectionFill(hex: string, towardWhite = 0.42): string {
  const raw = hex.trim().replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6 || Number.isNaN(parseInt(full, 16))) return hex;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * towardWhite);
  const r = mix(parseInt(full.slice(0, 2), 16));
  const g = mix(parseInt(full.slice(2, 4), 16));
  const b = mix(parseInt(full.slice(4, 6), 16));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
