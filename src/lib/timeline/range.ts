import { format, parse, subMonths } from "date-fns";

/** Max future-distribution month columns shown on the timeline. */
export const TIMELINE_FUTURE_MONTHS_LIMIT = 2;

export interface MonthRange {
  start: string;
  end: string;
}

export function compareMonths(a: string, b: string): number {
  return a.localeCompare(b);
}

export function rangesEqual(a: MonthRange, b: MonthRange): boolean {
  return a.start === b.start && a.end === b.end;
}

export function filterMonthsInRange(months: string[], range: MonthRange): string[] {
  return months.filter((m) => m >= range.start && m <= range.end);
}

/** Timeline never shows calendar-future months — those belong on Projections. */
export function capMonthsToPresent(months: string[], now = new Date()): string[] {
  const todayYm = format(now, "yyyy-MM");
  return [...months].filter((m) => m <= todayYm).sort(compareMonths);
}

/**
 * Future-distribution columns from the payroll file that are this month or earlier.
 * Upcoming calendar months stay on Projections.
 */
export function visibleFutureMonths(
  futureMonths: string[],
  _limit = TIMELINE_FUTURE_MONTHS_LIMIT,
  now = new Date()
): string[] {
  return capMonthsToPresent(futureMonths, now);
}

export function getDefaultPastYearRange(availableMonths: string[]): MonthRange {
  const sorted = [...availableMonths].sort(compareMonths);
  const todayYm = format(new Date(), "yyyy-MM");

  if (sorted.length === 0) {
    const end = todayYm;
    return { start: format(subMonths(parse(`${end}-01`, "yyyy-MM-dd", new Date()), 11), "yyyy-MM"), end };
  }

  const atOrBeforeToday = sorted.filter((m) => m <= todayYm);
  const end = atOrBeforeToday.length > 0 ? atOrBeforeToday[atOrBeforeToday.length - 1] : sorted[sorted.length - 1];
  const endDate = parse(`${end}-01`, "yyyy-MM-dd", new Date());
  let start = format(subMonths(endDate, 11), "yyyy-MM");
  if (start < sorted[0]) start = sorted[0];
  if (start > end) start = end;
  return { start, end };
}

export function clampRangeToAvailable(
  range: MonthRange,
  availableMonths: string[]
): MonthRange {
  const sorted = [...availableMonths].sort(compareMonths);
  if (sorted.length === 0) return range;

  let { start, end } = range;
  if (start > end) [start, end] = [end, start];
  if (start < sorted[0]) start = sorted[0];
  if (end > sorted[sorted.length - 1]) end = sorted[sorted.length - 1];
  if (start > end) start = end;
  return { start, end };
}

/**
 * Default window: ~12 months of actuals through the latest actual month
 * (never past the current calendar month).
 */
export function getDefaultTimelineRange(
  actualMonths: string[],
  futureMonths: string[]
): MonthRange {
  const pool = [...actualMonths, ...futureMonths].sort(compareMonths);
  const pastRange = getDefaultPastYearRange(actualMonths.length > 0 ? actualMonths : pool);
  if (futureMonths.length === 0) return clampRangeToAvailable(pastRange, pool);
  const end = futureMonths[futureMonths.length - 1]!;
  return clampRangeToAvailable({ start: pastRange.start, end }, pool);
}

export function resolveTimelineRange(
  availableMonths: string[],
  stored: MonthRange | null | undefined,
  options?: { actualMonths?: string[]; futureMonths?: string[] }
): MonthRange {
  const actual = options?.actualMonths ?? availableMonths;
  const future = options?.futureMonths ?? [];
  const defaultRange = getDefaultTimelineRange(actual, future);
  if (!stored?.start || !stored?.end) return defaultRange;
  const sorted = [...availableMonths].sort(compareMonths);
  const latest = sorted[sorted.length - 1];
  if (latest && stored.end < latest) return defaultRange;
  const clamped = clampRangeToAvailable(stored, availableMonths);
  if (clamped.start > clamped.end) return defaultRange;
  return clamped;
}

export function presetPastMonths(availableMonths: string[], count: number): MonthRange {
  const sorted = [...availableMonths].sort(compareMonths);
  if (sorted.length === 0) return getDefaultPastYearRange([]);
  const end = sorted[sorted.length - 1];
  const endDate = parse(`${end}-01`, "yyyy-MM-dd", new Date());
  let start = format(subMonths(endDate, count - 1), "yyyy-MM");
  if (start < sorted[0]) start = sorted[0];
  return clampRangeToAvailable({ start, end }, sorted);
}

export function presetFullRange(availableMonths: string[]): MonthRange {
  const sorted = [...availableMonths].sort(compareMonths);
  if (sorted.length === 0) return getDefaultPastYearRange([]);
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}
