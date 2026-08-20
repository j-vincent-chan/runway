import type { AppSettings } from "@/types";
import { hiddenFundKey } from "@/lib/funding/visibility";
import { roundCurrencyAmount } from "@/lib/utils/parse";
import { differenceInCalendarDays, endOfMonth, isValid, parseISO } from "date-fns";

export function getRunwayAssumedEndDate(
  settings: AppSettings,
  employeeId: string,
  fundingSourceId: string
): string | undefined {
  const key = hiddenFundKey(employeeId, fundingSourceId);
  return settings.runwayAssumedEndDates?.[key];
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
