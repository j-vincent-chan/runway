import type { PayrollReportSnapshot } from "@/types";
import { calculateMonthlyCost } from "@/lib/calculations";
import { addMonthsYm } from "@/lib/projections/horizon";
import { hasPercentEffort } from "@/lib/utils/parse";

/**
 * The report's run day as yyyy-MM-dd. The parser stores the Parameters
 * sheet's Report Run Date as an ISO instant built from a local-time Excel
 * date, so a timestamp is read back as the local calendar day it was run on
 * — an evening run on the last day of a month must not close that month
 * because its UTC day is already the first of the next. A plain date string
 * is taken as written.
 */
export function reportRunDay(reportDate: string | undefined): string | null {
  if (!reportDate) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return reportDate;
  const parsed = new Date(reportDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A month is closed only when the report was run on or after the first day
 * of the following month. The Dashboard's resolvePeriodStatus still calls
 * any Actual-section month closed; the reconciliation rules use this test
 * instead, because a report run mid-month after one biweekly posting must
 * never become a rate reference.
 */
export function isMonthClosedByRunDate(month: string, reportDate: string | undefined): boolean {
  const runDay = reportRunDay(reportDate);
  if (!runDay) return false;
  return runDay >= `${addMonthsYm(month, 1)}-01`;
}

/** Months with posted pay for this person — effort or dollars in an Actual month. */
export function chargedMonths(snapshot: PayrollReportSnapshot, employeeId: string): string[] {
  const actual = new Set(snapshot.actualMonths);
  const months = new Set<string>();
  for (const a of snapshot.monthlyAllocations) {
    if (a.employeeId !== employeeId || !hasPercentEffort(a.percentEffort)) continue;
    if (a.sourceType === "actual" || actual.has(a.month)) months.add(a.month);
  }
  for (const c of snapshot.monthlyCosts) {
    if (c.employeeId !== employeeId || c.amount <= 0) continue;
    if (c.sourceType === "actual" || actual.has(c.month)) months.add(c.month);
  }
  return [...months].sort();
}

export function firstChargedMonth(snapshot: PayrollReportSnapshot, employeeId: string): string | null {
  return chargedMonths(snapshot, employeeId)[0] ?? null;
}

/**
 * Closed months with posted salary and benefits that can stand as a rate
 * reference. Payroll carries no start day, so a person's first charged month
 * may be a partial one and is never counted — only months after it qualify.
 */
export function closedFullMonths(snapshot: PayrollReportSnapshot, employeeId: string): string[] {
  return chargedMonths(snapshot, employeeId)
    .slice(1)
    .filter(
      (m) =>
        isMonthClosedByRunDate(m, snapshot.reportDate) &&
        calculateMonthlyCost(employeeId, m, snapshot.monthlyCosts).total > 0
    );
}

export function latestClosedFullMonth(
  snapshot: PayrollReportSnapshot,
  employeeId: string
): string | null {
  const months = closedFullMonths(snapshot, employeeId);
  return months[months.length - 1] ?? null;
}

/** The last Actual month when the report was run before it ended, else null. */
export function inProgressMonth(snapshot: PayrollReportSnapshot): string | null {
  const last = [...snapshot.actualMonths].sort()[snapshot.actualMonths.length - 1];
  if (!last) return null;
  return isMonthClosedByRunDate(last, snapshot.reportDate) ? null : last;
}
