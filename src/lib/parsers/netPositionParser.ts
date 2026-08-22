import type { NetPositionAccountRow, NetPositionReportImport, ParseWarning } from "@/types";
import type { WorkBook } from "xlsx";
import { getSheetData, readWorkbook } from "@/lib/parsers/payrollFundingParser";
import { generateId, parseCurrency } from "@/lib/utils/parse";
import { format } from "date-fns";

export { readWorkbook };

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

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

/** "7000 - Private Restricted Gifts" → code + description */
export function splitCodeDescription(value: string): {
  code: string;
  description?: string;
} {
  const s = value.trim();
  if (!s) return { code: "" };
  const idx = s.indexOf(" - ");
  if (idx <= 0) return { code: s };
  const code = s.slice(0, idx).trim();
  const description = s.slice(idx + 3).trim();
  return { code, description: description || undefined };
}

function parseMonthToken(token: string): string | undefined {
  const t = token.trim();
  if (!t) return undefined;
  const mdy = t.match(/^(\w+)\s+(\d{4})$/i);
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase()];
    if (month) return `${mdy[2]}-${month}`;
  }
  const yyyyMm = t.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyyMm) return `${yyyyMm[1]}-${yyyyMm[2].padStart(2, "0")}`;
  return undefined;
}

/** "Jul 2026 - Aug 2026" → { start, end } as yyyy-MM */
export function parseDateParameters(raw: string): {
  periodStart?: string;
  periodEnd?: string;
} {
  const s = raw.trim();
  if (!s) return {};
  const parts = s.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      periodStart: parseMonthToken(parts[0]),
      periodEnd: parseMonthToken(parts[parts.length - 1]),
    };
  }
  const single = parseMonthToken(s);
  return single ? { periodStart: single, periodEnd: single } : {};
}

function findParamValue(data: unknown[][], labelRe: RegExp): unknown {
  for (const row of data) {
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      if (!labelRe.test(cell)) continue;
      // Value may be same cell after ":", or the next non-empty cell.
      const afterColon = cell.includes(":") ? cell.split(":").slice(1).join(":").trim() : "";
      if (afterColon) return afterColon;
      for (let n = c + 1; n < row.length; n++) {
        const v = row[n];
        if (v !== "" && v !== null && v !== undefined) return v;
      }
    }
  }
  return undefined;
}

function parseReportMeta(wb: WorkBook): {
  reportRunDate?: string;
  periodStart?: string;
  periodEnd?: string;
} {
  const paramsSheet =
    wb.SheetNames.find((n) => n.toLowerCase() === "parameters") ?? wb.SheetNames[0];
  const data = getSheetData(wb, paramsSheet);
  const runRaw = findParamValue(data, /report\s*run\s*date/i);
  const periodRaw = findParamValue(data, /date\s*parameters/i);
  const period =
    typeof periodRaw === "string" || typeof periodRaw === "number"
      ? parseDateParameters(String(periodRaw))
      : {};
  return {
    reportRunDate: parseExcelDate(runRaw),
    ...period,
  };
}

function isHeaderRow(row: unknown[]): boolean {
  const a = String(row[0] ?? "").trim().toLowerCase();
  const b = String(row[1] ?? "").trim().toLowerCase();
  return a.includes("bus unit") && b.includes("dept");
}

function isDataRow(row: unknown[]): boolean {
  const bus = String(row[0] ?? "").trim();
  if (!bus) return false;
  if (/^report\s*total$/i.test(bus)) return false;
  if (/^bus\s*unit$/i.test(bus)) return false;
  const fund = String(row[2] ?? "").trim();
  const dept = String(row[1] ?? "").trim();
  const project = String(row[3] ?? "").trim();
  return Boolean(fund && dept && project);
}

function numOrZero(value: unknown): number {
  return parseCurrency(value) ?? 0;
}

export function parseNetPositionWorkbook(
  wb: WorkBook,
  fileName: string
): { import: NetPositionReportImport; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("net position") && !n.toLowerCase().includes("parameter")) ??
    wb.SheetNames.find((n) => !n.toLowerCase().includes("parameter")) ??
    wb.SheetNames[0];

  const data = getSheetData(wb, sheetName);
  const meta = parseReportMeta(wb);
  if (!meta.reportRunDate) {
    warnings.push({
      id: generateId(),
      severity: "warning",
      sheetName: "Parameters",
      message: "Report Run Date not found — using upload date.",
    });
  }

  let headerSeen = false;
  const rows: NetPositionAccountRow[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!headerSeen) {
      if (isHeaderRow(row)) headerSeen = true;
      continue;
    }
    // Skip the sub-header row ("Beginning of Period", …)
    if (!String(row[0] ?? "").trim() && !String(row[2] ?? "").trim()) continue;
    if (!isDataRow(row)) continue;

    const busUnit = String(row[0] ?? "").trim();
    const deptParts = splitCodeDescription(String(row[1] ?? ""));
    const fundParts = splitCodeDescription(String(row[2] ?? ""));
    const projectParts = splitCodeDescription(String(row[3] ?? ""));
    const parentParts = splitCodeDescription(String(row[4] ?? ""));

    if (!fundParts.code || !deptParts.code || !projectParts.code) {
      warnings.push({
        id: generateId(),
        severity: "warning",
        sheetName,
        rowNumber: i + 1,
        message: `Skipped row missing fund/dept/project codes.`,
        rawValue: String(row.slice(0, 5)),
      });
      continue;
    }

    const endingRaw = row[10];
    const endingBalance = parseCurrency(endingRaw);
    if (endingBalance === null) {
      warnings.push({
        id: generateId(),
        severity: "warning",
        sheetName,
        rowNumber: i + 1,
        message: `Could not parse ending Net Position for ${fundParts.code}-${deptParts.code}-${projectParts.code}`,
        rawValue: String(endingRaw),
      });
      continue;
    }

    rows.push({
      accountKey: `${fundParts.code}-${deptParts.code}-${projectParts.code}`,
      busUnit,
      fund: fundParts.code,
      fundDescription: fundParts.description,
      dept: deptParts.code,
      deptDescription: deptParts.description,
      project: projectParts.code,
      projectDescription: projectParts.description,
      parentAwardId: parentParts.code || undefined,
      parentAwardDescription: parentParts.description,
      beginningBalance: numOrZero(row[5]),
      revenues: numOrZero(row[6]),
      expenses: numOrZero(row[7]),
      otherChanges: numOrZero(row[8]),
      netChange: numOrZero(row[9]),
      endingBalance,
    });
  }

  if (rows.length === 0) {
    warnings.push({
      id: generateId(),
      severity: "error",
      sheetName,
      message: "No account rows found on Net Position sheet.",
    });
  }

  return {
    import: {
      id: generateId(),
      sourceFileName: fileName,
      uploadedAt: new Date().toISOString(),
      reportRunDate: meta.reportRunDate ?? format(new Date(), "yyyy-MM-dd"),
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      sheetName,
      rows,
    },
    warnings,
  };
}

export async function parseNetPositionFile(file: File): Promise<{
  import: NetPositionReportImport;
  warnings: ParseWarning[];
}> {
  const wb = await readWorkbook(file);
  return parseNetPositionWorkbook(wb, file.name);
}
