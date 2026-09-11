import { splitChartstring } from "@/lib/funding/chartstring";
import { toCsv } from "@/lib/export/csv";

/**
 * One exported row: the person the account is listed under (absent on
 * Account Balances, which is not grouped by person), the account's displayed
 * name without its project-number suffix, and the chartstring as the page
 * shows it.
 */
export interface ChartstringCsvEntry {
  person?: string;
  account: string;
  chartstring: string;
}

const ACCOUNT_COLUMNS = [
  "Account",
  "Chartstring",
  "Fund",
  "Dept ID",
  "Project Number",
  "Activity Code",
] as const;

export type ChartstringCsvPage = "distributions" | "projections" | "runway" | "account-balances";

/**
 * The chartstrings on a page, one row each, with the chartstring broken into
 * the four chartfields other UCSF systems ask for separately. Whatever the
 * page filtered, hid, sorted or revealed is what arrives here — the caller
 * passes exactly the rows it rendered.
 */
export function buildChartstringCsv(
  entries: ChartstringCsvEntry[],
  options: { withPerson: boolean }
): string {
  const header = options.withPerson ? ["Person", ...ACCOUNT_COLUMNS] : [...ACCOUNT_COLUMNS];
  const rows = entries.map((entry) => {
    const { fund, dept, project, activity } = splitChartstring(entry.chartstring);
    const cells = [entry.account, entry.chartstring.trim(), fund, dept, project, activity];
    return options.withPerson ? [entry.person ?? "", ...cells] : cells;
  });
  return toCsv(header, rows);
}

/** `distributions-chartstrings-2026-09-11.csv` — the page, then the day it was taken. */
export function chartstringCsvFilename(page: ChartstringCsvPage, today: Date = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${page}-chartstrings-${y}-${m}-${d}.csv`;
}
