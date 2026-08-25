import { addMonths, format, parse } from "date-fns";
import type { PayrollReportSnapshot, ProjectionHorizonSettings } from "@/types";
import { getAllMonths } from "@/lib/calculations";

/**
 * Hard ceiling on any projected window. `monthsInclusive` stops here silently,
 * so this must be at least the longest option the Dashboard's scope control
 * offers — otherwise picking that option renders a shorter window than it says.
 */
export const MAX_PROJECTION_MONTHS = 48;

export function addMonthsYm(ym: string, count: number): string {
  return format(addMonths(parse(`${ym}-01`, "yyyy-MM-dd", new Date()), count), "yyyy-MM");
}

export function monthsInclusive(start: string, end: string): string[] {
  if (end < start) return [start];
  const out: string[] = [];
  let cur = start;
  while (cur <= end && out.length < MAX_PROJECTION_MONTHS) {
    out.push(cur);
    cur = addMonthsYm(cur, 1);
  }
  return out;
}

export function formatMonthLabel(ym: string): string {
  const d = parse(`${ym}-01`, "yyyy-MM-dd", new Date());
  return format(d, "MMM yyyy");
}

export function formatMonthShort(ym: string): string {
  const d = parse(`${ym}-01`, "yyyy-MM-dd", new Date());
  return format(d, "MMM");
}

/** Calendar month is always the projection origin. */
export function getProjectionOriginMonth(now = new Date()): string {
  return format(now, "yyyy-MM");
}

export function lastPayrollMonth(snapshot: PayrollReportSnapshot): string | null {
  const months = getAllMonths(snapshot);
  return months.length > 0 ? months[months.length - 1]! : null;
}

export function fiscalYearEndMonth(origin: string, fiscalYearStartMonth: number): string {
  const [y, m] = origin.split("-").map(Number);
  const start = fiscalYearStartMonth;
  const fyEndMonth = start === 1 ? 12 : start - 1;
  const fyEndYear = m >= start ? y + 1 : y;
  return `${fyEndYear}-${String(fyEndMonth).padStart(2, "0")}`;
}

export function resolveHorizonMonths(
  origin: string,
  horizon: ProjectionHorizonSettings | undefined,
  fiscalYearStartMonth: number
): string[] {
  const preset = horizon?.preset ?? "12";
  let end = addMonthsYm(origin, 11);
  if (preset === "6") end = addMonthsYm(origin, 5);
  else if (preset === "12") end = addMonthsYm(origin, 11);
  else if (preset === "24") end = addMonthsYm(origin, 23);
  else if (preset === "fy") end = fiscalYearEndMonth(origin, fiscalYearStartMonth);
  else if (preset === "custom" && horizon?.customEndMonth) {
    end = horizon.customEndMonth;
  }
  return monthsInclusive(origin, end);
}
