import type {
  NetPositionReportImport,
  ParseStatus,
  ParseWarning,
  PositionSalaryReportImport,
  PayrollReportSnapshot,
} from "@/types";
import { formatMonthDisplay } from "@/lib/utils/parse";

export function formatMonthRange(snapshot: PayrollReportSnapshot): string {
  const { start, end } = snapshot.monthRange;
  if (!start || !end) return "—";
  return `${formatMonthDisplay(start)} – ${formatMonthDisplay(end)}`;
}

export function getLatestNetPositionImportId(
  imports: NetPositionReportImport[]
): string | null {
  if (imports.length === 0) return null;
  const sorted = [...imports].sort((a, b) => {
    const aKey = a.periodEnd ?? a.reportRunDate;
    const bKey = b.periodEnd ?? b.reportRunDate;
    const byPeriod = bKey.localeCompare(aKey);
    if (byPeriod !== 0) return byPeriod;
    const byRun = b.reportRunDate.localeCompare(a.reportRunDate);
    if (byRun !== 0) return byRun;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });
  return sorted[0]?.id ?? null;
}

export function getLatestPositionSalaryImportId(
  imports: PositionSalaryReportImport[]
): string | null {
  if (imports.length === 0) return null;
  const sorted = [...imports].sort((a, b) => {
    const fy = (b.fiscalYear ?? "").localeCompare(a.fiscalYear ?? "");
    if (fy !== 0) return fy;
    const byRun = (b.reportRunDate ?? "").localeCompare(a.reportRunDate ?? "");
    if (byRun !== 0) return byRun;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });
  return sorted[0]?.id ?? null;
}

export function countParseWarnings(snapshot: PayrollReportSnapshot | null): number {
  if (!snapshot) return 0;
  return snapshot.parseWarnings.filter((w) => w.severity !== "info").length;
}

export function dataFreshnessLabel(uploadedAt: string): { label: string; tone: "good" | "neutral" } {
  const ageMs = Date.now() - new Date(uploadedAt).getTime();
  const days = ageMs / (1000 * 60 * 60 * 24);
  if (days <= 14) return { label: "Up to date", tone: "good" };
  if (days <= 60) return { label: "Recent import", tone: "neutral" };
  return { label: "Consider refreshing", tone: "neutral" };
}

/**
 * The single rule for grading a parse by its warnings — the same one the
 * payroll parser applies to its own output, so every uploader's badge means
 * the same thing.
 */
export function parseStatusFromWarnings(warnings: ParseWarning[]): ParseStatus {
  if (warnings.some((w) => w.severity === "error")) return "failed";
  if (warnings.some((w) => w.severity === "warning")) return "partial";
  return "success";
}

/**
 * Joins file names into one sentence-ready list — "A", "A and B",
 * "A, B, and C" — so an uploader's confirmation can name every file it
 * handled rather than count them.
 */
export function formatFileNameList(names: string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}

export function parseStatusLabel(status: string): string {
  if (status === "success") return "Success";
  if (status === "partial") return "Partial";
  if (status === "failed") return "Failed";
  return status;
}
