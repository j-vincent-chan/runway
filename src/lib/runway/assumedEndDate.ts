import type { AppSettings } from "@/types";
import { normalizeChartstring } from "@/lib/funding/chartstring";
import { roundCurrencyAmount } from "@/lib/utils/parse";
import { differenceInCalendarDays, endOfMonth, format, isValid, parseISO } from "date-fns";
import { fiscalYearEndMonth } from "@/lib/projections/horizon";

/**
 * End dates are keyed by account, not by person-and-fund. The account is the
 * thing that ends; keying per person would give one account as many dates as
 * it has people charging it.
 */
export function getRunwayAssumedEndDate(
  settings: AppSettings,
  accountKey: string
): string | undefined {
  return settings.runwayAssumedEndDates?.[normalizeChartstring(accountKey)];
}

/**
 * The end date an account marked "not my account" gets when none is given.
 *
 * Every such account must carry one: without it the account reads as never
 * running out, and there is no such thing as infinite runway. Fiscal year end
 * is the default because it is the horizon the money is actually budgeted
 * against, and it forces a review each year rather than never.
 *
 * The last day of that month, not the first — `fiscalYearEndMonth` returns
 * `yyyy-MM`, and anchoring to the 1st would cut the final month off the
 * estimate. Full `yyyy-MM-dd` so a date input can display it.
 */
export function defaultAssumedEndDate(
  fiscalYearStartMonth: number,
  originMonth: string
): string {
  const fyEnd = fiscalYearEndMonth(originMonth, fiscalYearStartMonth);
  const [y, m] = fyEnd.split("-").map(Number);
  return format(endOfMonth(new Date(y!, m! - 1, 1)), "yyyy-MM-dd");
}

/** Fractional months from end of planning month to the estimated end date. */
export function monthsUntilAssumedEnd(
  planningMonthYyyyMm: string,
  endDateIso: string
): number | null {
  const normalized =
    endDateIso.length === 7 ? `${endDateIso}-01` : endDateIso.slice(0, 10);
  const end = parseISO(normalized);
  if (!isValid(end)) return null;

  const [y, m] = planningMonthYyyyMm.split("-").map(Number);
  const from = endOfMonth(new Date(y, m - 1, 1));
  const days = differenceInCalendarDays(end, from);
  if (days < 0) return 0;
  return days / 30.4375;
}

export function estimateBalanceFromAssumedEnd(
  monthsRunway: number,
  sharedMonthlyBurn: number
): number {
  if (sharedMonthlyBurn <= 0 || monthsRunway <= 0) return 0;
  return roundCurrencyAmount(sharedMonthlyBurn * monthsRunway);
}

/**
 * Give every account marked "not mine" an end date it is missing.
 *
 * Workspaces saved before the date became required can hold accounts marked
 * "not my account" with no horizon at all. Left alone they would keep reading
 * as infinite forever, so they converge to the same default on load rather
 * than behaving differently from anything marked afterwards.
 *
 * Returns the same object when there is nothing to add, so callers can skip a
 * pointless settings write.
 */
export function backfillAssumedEndDates(
  notMyAccountKeys: string[],
  endDates: Record<string, string> | undefined,
  fiscalYearStartMonth: number,
  originMonth: string
): Record<string, string> {
  const current = { ...(endDates ?? {}) };
  const missing = notMyAccountKeys
    .map(normalizeChartstring)
    .filter((key) => !current[key]);
  if (missing.length === 0) return endDates ?? current;

  const fallback = defaultAssumedEndDate(fiscalYearStartMonth, originMonth);
  for (const key of missing) current[key] = fallback;
  return current;
}
