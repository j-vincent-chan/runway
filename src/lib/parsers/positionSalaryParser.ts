import type {
  ParseWarning,
  PayFrequency,
  PositionSalaryPosition,
  PositionSalaryReportImport,
} from "@/types";
import type { WorkBook } from "xlsx";
import { format } from "date-fns";
import { getSheetData, readWorkbook } from "@/lib/parsers/payrollFundingParser";
import { splitCodeDescription } from "@/lib/parsers/netPositionParser";
import {
  detectPayFrequency,
  generateId,
  parseCurrency,
  parseEmployeeName,
} from "@/lib/utils/parse";

export { readWorkbook };

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

function findParamValue(data: unknown[][], labelRe: RegExp): unknown {
  for (const row of data) {
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      if (!labelRe.test(cell)) continue;
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

export function parseFiscalYearToken(raw: string): string | undefined {
  const m = String(raw).match(/(\d{4}\s*[-–]\s*\d{2,4})/);
  if (!m) return undefined;
  return m[1]!.replace(/\s/g, "").replace(/–/g, "-").replace(/;$/, "");
}

export function payFrequencyFromCompFreq(compFreq: string): PayFrequency | undefined {
  const l = compFreq.toLowerCase();
  if (l.includes("hourly")) return undefined;
  if (l.includes("uc_fy") || l.includes("12/12") || l.includes("fiscal")) return "monthly";
  return detectPayFrequency(compFreq);
}

function money(value: unknown): number {
  return parseCurrency(value) ?? 0;
}

function fteValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return parseCurrency(value) ?? 0;
}

function colIndex(header: string[], ...names: string[]): number {
  for (const name of names) {
    const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function cell(row: unknown[], index: number): unknown {
  return index >= 0 ? row[index] : "";
}

function isHeaderRow(row: unknown[]): boolean {
  const a = String(row[0] ?? "").trim().toLowerCase();
  const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" | ");
  return a === "employee" && joined.includes("total salary") && joined.includes("ucsf empl");
}

function parseSectionName(label: string): { name: string; ucsfEmplId?: string; ucpathEmplId?: string } {
  const stripped = label.replace(/^Employee:\s*/i, "").trim();
  const ids = stripped.match(/\(([^)]+)\)\s*$/);
  const parsed = parseEmployeeName(stripped);
  let ucsfEmplId = parsed.employeeId;
  let ucpathEmplId: string | undefined;
  if (ids) {
    const parts = ids[1]!.split(/[/,]/).map((p) => p.trim()).filter(Boolean);
    if (parts[0]) ucsfEmplId = parts[0];
    if (parts[1]) ucpathEmplId = parts[1];
  }
  return { name: parsed.name, ucsfEmplId, ucpathEmplId };
}

function jobRole(jobCode: string): string | undefined {
  const { description, code } = splitCodeDescription(jobCode);
  return description || (code && !/^\d+$/.test(code) ? code : undefined);
}

export function parsePositionSalaryWorkbook(
  wb: WorkBook,
  fileName: string
): { import: PositionSalaryReportImport; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const paramsSheet = wb.SheetNames.find((n) => n.toLowerCase().includes("parameter"));
  const params = paramsSheet ? getSheetData(wb, paramsSheet) : [];
  const runRaw = findParamValue(params, /report\s*run\s*date/i);
  const fyRaw = findParamValue(params, /fiscal\s*year/i);
  const fiscalYear = fyRaw != null ? parseFiscalYearToken(String(fyRaw)) : undefined;
  const reportRunDate = parseExcelDate(runRaw);

  const sheetName =
    wb.SheetNames.find(
      (n) => n.toLowerCase().includes("position salary") && !n.toLowerCase().includes("parameter")
    ) ??
    wb.SheetNames.find((n) => !n.toLowerCase().includes("parameter")) ??
    wb.SheetNames[0];

  const data = getSheetData(wb, sheetName);
  let headerIdx = -1;
  for (let i = 0; i < data.length; i++) {
    if (isHeaderRow(data[i]!)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    warnings.push({
      id: generateId(),
      severity: "error",
      sheetName,
      message: "Could not find Employee / Total Salary header row.",
    });
    return {
      import: {
        id: generateId(),
        sourceFileName: fileName,
        uploadedAt: new Date().toISOString(),
        reportRunDate,
        fiscalYear,
        sheetName,
        people: [],
      },
      warnings,
    };
  }

  const header = data[headerIdx]!.map((c) => String(c ?? "").trim());
  const iName = colIndex(header, "Employee");
  const iUcsf = colIndex(header, "UCSF Empl ID");
  const iUcpath = colIndex(header, "UCPath Empl ID");
  const iPosition = colIndex(header, "Position");
  const iReportsTo = colIndex(header, "Reports To");
  const iJob = colIndex(header, "Job Code");
  const iFte = colIndex(header, "Job FTE");
  const iStatus = colIndex(header, "Employee Status");
  const iClass = colIndex(header, "Employee Class");
  const iPlan = colIndex(header, "Salary Admin Plan");
  const iFreq = colIndex(header, "Comp Freq");
  const iJobDate = colIndex(header, "Job Effective Date");
  const iDistDate = colIndex(header, "Distribution Begin Date");
  const iX = colIndex(header, "Base Salary (X)");
  const iY = colIndex(header, "Negotiated Salary (Y)");
  const iZ = colIndex(header, "Other Compensation (Z)");
  const iTotal = colIndex(header, "Total Salary");

  const people: PositionSalaryPerson[] = [];
  let current: {
    name: string;
    ucsfEmplId: string;
    ucpathEmplId?: string;
    reportsTo?: string;
    positions: PositionSalaryPosition[];
  } | null = null;

  const flush = (totals?: {
    baseSalaryX: number;
    negotiatedSalaryY: number;
    otherCompensationZ: number;
    totalSalary: number;
  }) => {
    if (!current || current.positions.length === 0) {
      current = null;
      return;
    }
    const positions = current.positions;
    const jobFte = Math.max(0, ...positions.map((p) => p.jobFte));
    const primary =
      [...positions].sort((a, b) => b.totalSalary - a.totalSalary)[0] ?? positions[0]!;
    const summed = {
      baseSalaryX: positions.reduce((s, p) => s + p.baseSalaryX, 0),
      negotiatedSalaryY: positions.reduce((s, p) => s + p.negotiatedSalaryY, 0),
      otherCompensationZ: positions.reduce((s, p) => s + p.otherCompensationZ, 0),
      totalSalary: positions.reduce((s, p) => s + p.totalSalary, 0),
    };
    people.push({
      name: current.name,
      ucsfEmplId: current.ucsfEmplId,
      ucpathEmplId: current.ucpathEmplId,
      reportsTo: current.reportsTo,
      jobFte,
      compFreq: primary.compFreq,
      role: primary.jobCode ? jobRole(primary.jobCode) : undefined,
      ...(totals ?? summed),
      positions,
    });
    current = null;
  };

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i]!;
    const label = String(cell(row, iName) ?? "").trim();
    if (/^Employee:/i.test(label)) {
      flush();
      const parsed = parseSectionName(label);
      current = {
        name: parsed.name,
        ucsfEmplId: parsed.ucsfEmplId ?? "",
        ucpathEmplId: parsed.ucpathEmplId,
        positions: [],
      };
      continue;
    }
    if (/^Total:/i.test(label)) {
      flush({
        baseSalaryX: money(cell(row, iX)),
        negotiatedSalaryY: money(cell(row, iY)),
        otherCompensationZ: money(cell(row, iZ)),
        totalSalary: money(cell(row, iTotal)),
      });
      continue;
    }

    const ucsf = String(cell(row, iUcsf) ?? "").trim();
    if (!ucsf) continue;

    const position: PositionSalaryPosition = {
      position: String(cell(row, iPosition) ?? "").trim(),
      jobCode: String(cell(row, iJob) ?? "").trim() || undefined,
      jobFte: fteValue(cell(row, iFte)),
      employeeStatus: String(cell(row, iStatus) ?? "").trim() || undefined,
      employeeClass: String(cell(row, iClass) ?? "").trim() || undefined,
      salaryAdminPlan: String(cell(row, iPlan) ?? "").trim() || undefined,
      compFreq: String(cell(row, iFreq) ?? "").trim() || undefined,
      jobEffectiveDate: parseExcelDate(cell(row, iJobDate)),
      distributionBeginDate: parseExcelDate(cell(row, iDistDate)),
      baseSalaryX: money(cell(row, iX)),
      negotiatedSalaryY: money(cell(row, iY)),
      otherCompensationZ: money(cell(row, iZ)),
      totalSalary: money(cell(row, iTotal)),
    };

    if (!current) {
      const parsed = parseEmployeeName(label);
      current = {
        name: parsed.name || label,
        ucsfEmplId: ucsf,
        ucpathEmplId: String(cell(row, iUcpath) ?? "").trim() || undefined,
        reportsTo: String(cell(row, iReportsTo) ?? "").trim() || undefined,
        positions: [],
      };
    } else {
      if (!current.ucsfEmplId) current.ucsfEmplId = ucsf;
      if (!current.ucpathEmplId) {
        current.ucpathEmplId = String(cell(row, iUcpath) ?? "").trim() || undefined;
      }
      if (!current.reportsTo) {
        current.reportsTo = String(cell(row, iReportsTo) ?? "").trim() || undefined;
      }
    }
    current.positions.push(position);
  }
  flush();

  if (people.length === 0) {
    warnings.push({
      id: generateId(),
      severity: "error",
      sheetName,
      message: "No employee salary rows found.",
    });
  } else if (!fiscalYear) {
    warnings.push({
      id: generateId(),
      severity: "warning",
      sheetName: paramsSheet ?? "Parameters",
      message: "Fiscal Year not found on the Parameters sheet.",
    });
  }

  return {
    import: {
      id: generateId(),
      sourceFileName: fileName,
      uploadedAt: new Date().toISOString(),
      reportRunDate,
      fiscalYear,
      sheetName,
      people,
    },
    warnings,
  };
}

export async function parsePositionSalaryFile(file: File): Promise<{
  import: PositionSalaryReportImport;
  warnings: ParseWarning[];
}> {
  const wb = await readWorkbook(file);
  return parsePositionSalaryWorkbook(wb, file.name);
}
