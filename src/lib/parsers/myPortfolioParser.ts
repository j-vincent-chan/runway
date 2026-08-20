import type { ParseWarning, PortfolioBalanceRow, PortfolioReportImport } from "@/types";
import type { WorkBook } from "xlsx";
import { getSheetData, readWorkbook } from "@/lib/parsers/payrollFundingParser";
import { buildPortfolioChartstring } from "@/lib/funding/chartstring";
import { generateId, parseCurrency } from "@/lib/utils/parse";
import { format } from "date-fns";

export { readWorkbook };

const NET_WITH_LIENS_COL = 17;

function parseExcelDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, "yyyy-MM-dd");
  }
  if (typeof value === "number" && value > 30000) {
    const utcDays = Math.floor(value - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
  }
  const s = String(value ?? "").trim();
  if (!s) return undefined;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return format(new Date(parsed), "yyyy-MM-dd");
  return undefined;
}

function parseReportRunDate(wb: WorkBook): string | undefined {
  const paramsSheet =
    wb.SheetNames.find((n) => n.toLowerCase() === "parameters") ?? wb.SheetNames[0];
  const data = getSheetData(wb, paramsSheet);
  for (const row of data) {
    const label = String(row[0] ?? "").trim();
    if (/report\s*run\s*date/i.test(label)) {
      return parseExcelDate(row[1]);
    }
  }
  return undefined;
}

function isDataRow(row: unknown[]): boolean {
  const project = String(row[0] ?? "").trim();
  if (!project) return false;
  if (/total$/i.test(project)) return false;
  if (/^as\s/i.test(project)) return false;
  if (/^non-sponsored|^sponsored/i.test(project)) return false;
  const fund = String(row[2] ?? "").trim();
  const dept = String(row[3] ?? "").trim();
  return /^\d+$/.test(fund) && /^\d+$/.test(dept);
}

export function parseMyPortfolioWorkbook(
  wb: WorkBook,
  fileName: string
): { import: PortfolioReportImport; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("myportfolio") && n !== "Parameters") ??
    wb.SheetNames.find((n) => !n.toLowerCase().includes("parameter")) ??
    wb.SheetNames[0];

  const data = getSheetData(wb, sheetName);
  const runDate = parseReportRunDate(wb);
  if (!runDate) {
    warnings.push({
      id: generateId(),
      severity: "warning",
      sheetName: "Parameters",
      message: "Report Run Date not found — using upload date for duplicate resolution.",
    });
  }

  const rows: PortfolioBalanceRow[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!isDataRow(row)) continue;

    const fund = String(row[2] ?? "").trim();
    const dept = String(row[3] ?? "").trim();
    const project = String(row[0] ?? "").trim();
    const activity = String(row[1] ?? "").trim();
    const chartstring = buildPortfolioChartstring(fund, dept, project, activity);
    const rawBalance = row[NET_WITH_LIENS_COL];
    const balance = parseCurrency(rawBalance);
    if (balance === null) {
      warnings.push({
        id: generateId(),
        severity: "warning",
        sheetName,
        rowNumber: i + 1,
        message: `Could not parse Current Net Position with Liens for ${chartstring}`,
        rawValue: String(rawBalance),
      });
      continue;
    }

    rows.push({
      chartstring,
      balance,
      projectTitle: String(row[7] ?? "").trim() || undefined,
      fund,
      dept,
      project,
      activity: activity || undefined,
    });
  }

  if (rows.length === 0) {
    warnings.push({
      id: generateId(),
      severity: "error",
      sheetName,
      message: "No account rows found on MyPortfolio sheet.",
    });
  }

  return {
    import: {
      id: generateId(),
      sourceFileName: fileName,
      uploadedAt: new Date().toISOString(),
      reportRunDate: runDate ?? format(new Date(), "yyyy-MM-dd"),
      sheetName,
      rows,
    },
    warnings,
  };
}

export async function parseMyPortfolioFile(file: File): Promise<{
  import: PortfolioReportImport;
  warnings: ParseWarning[];
}> {
  const wb = await readWorkbook(file);
  return parseMyPortfolioWorkbook(wb, file.name);
}
