import { addMonths, format, parse } from "date-fns";

const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function shiftMonth(ym: string, delta: number): string {
  const d = parse(`${ym}-01`, "yyyy-MM-dd", new Date());
  return format(addMonths(d, delta), "yyyy-MM");
}

/** `2026-11` → `November 2026` */
export function monthLabelLong(ym: string): string {
  const [year, month] = ym.split("-");
  const name = MONTH_NAMES_LONG[Number(month) - 1];
  if (!name || !year) return ym;
  return `${name} ${year}`;
}

/** `2026-11` → `Nov 26` */
export function monthLabelShort(ym: string): string {
  const [year, month] = ym.split("-");
  const name = MONTH_NAMES_SHORT[Number(month) - 1];
  if (!name || !year) return ym;
  return `${name} ${year.slice(2)}`;
}

/** Period keys may be `yyyy-MM` or a full `yyyy-MM-dd` report run date. */
export function periodKeyToMonth(periodKey: string): string {
  return periodKey.slice(0, 7);
}

/**
 * Fiscal year containing `month`, identified by the calendar year it ends in.
 * July start: Aug 2026 → 2027 (FY26–27).
 */
export function fiscalYearEndingYear(month: string, fyStartMonth: number): number {
  const [yearStr, monthStr] = month.split("-");
  const y = parseInt(yearStr ?? "", 10);
  const m = parseInt(monthStr ?? "", 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return NaN;
  return m >= fyStartMonth ? y + 1 : y;
}

/** `2027` → `FY26–27` */
export function fiscalYearLabel(endingYear: number): string {
  const start = String(endingYear - 1).slice(-2);
  const end = String(endingYear).slice(-2);
  return `FY${start}–${end}`;
}

/** First month of the fiscal year that contains `month`. */
export function fiscalYearStartMonthYm(month: string, fyStartMonth: number): string {
  const [yearStr, monthStr] = month.split("-");
  const y = parseInt(yearStr ?? "", 10);
  const m = parseInt(monthStr ?? "", 10);
  const startYear = m >= fyStartMonth ? y : y - 1;
  return `${startYear}-${String(fyStartMonth).padStart(2, "0")}`;
}

/** Last month of the fiscal year that contains `month`. */
export function fiscalYearEndMonthYm(month: string, fyStartMonth: number): string {
  const [yearStr, monthStr] = month.split("-");
  const y = parseInt(yearStr ?? "", 10);
  const m = parseInt(monthStr ?? "", 10);
  const fyEndMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1;
  const fyEndYear = m >= fyStartMonth ? y + 1 : y;
  return `${fyEndYear}-${String(fyEndMonth).padStart(2, "0")}`;
}

/** Months from FY start through `month`, inclusive. */
export function monthsInFiscalYearToDate(month: string, fyStartMonth: number): string[] {
  const start = fiscalYearStartMonthYm(month, fyStartMonth);
  const out: string[] = [];
  let cur = start;
  while (cur <= month) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}
