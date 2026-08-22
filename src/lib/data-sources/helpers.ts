import type { PortfolioReportImport, NetPositionReportImport, PayrollReportSnapshot } from "@/types";
import { formatMonthDisplay } from "@/lib/utils/parse";

export function formatMonthRange(snapshot: PayrollReportSnapshot): string {
  const { start, end } = snapshot.monthRange;
  if (!start || !end) return "—";
  return `${formatMonthDisplay(start)} – ${formatMonthDisplay(end)}`;
}

export function portfolioDisplayName(fileName: string): string {
  const base = fileName.replace(/\.(xlsx|xls|csv)$/i, "").trim();
  const dashParts = base.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    return dashParts[0].replace(/-/g, " ").trim();
  }
  return base;
}

export function getLatestPortfolioImportId(imports: PortfolioReportImport[]): string | null {
  if (imports.length === 0) return null;
  const sorted = [...imports].sort((a, b) => {
    const byRun = b.reportRunDate.localeCompare(a.reportRunDate);
    if (byRun !== 0) return byRun;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });
  return sorted[0]?.id ?? null;
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

export function parseStatusLabel(status: string): string {
  if (status === "success") return "Success";
  if (status === "partial") return "Partial";
  if (status === "failed") return "Failed";
  return status;
}
