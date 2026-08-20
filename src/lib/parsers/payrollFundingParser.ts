import type {
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  ParsePreview,
  ParseWarning,
  PayrollReportSnapshot,
  RawParsedRow,
  RowType,
  SourceType,
} from "@/types";
import { FUNDING_COLORS, PARSER_VERSION } from "@/types";
import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";
import {
  chartstringToFund,
  chartstringToProjectId,
  extractChartstring,
  generateId,
  parseCurrency,
  detectPayFrequency,
  parseEmployeeName,
  parseMonthLabel,
  parsePercentCell,
  hasPercentEffort,
} from "@/lib/utils/parse";
import { normalizePersonName } from "@/lib/employees/stableKey";

export function readWorkbook(file: File): Promise<WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        resolve(XLSX.read(data, { type: "array", cellDates: true }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function getSheetData(wb: WorkBook, name: string): unknown[][] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

export function detectPayrollSheet(wb: WorkBook): string {
  for (const name of wb.SheetNames) {
    if (name.toLowerCase().includes("parameter")) continue;
    const data = getSheetData(wb, name);
    const hasHeader = data.some(
      (row) =>
        String(row[0]).toLowerCase().includes("employee") &&
        String(row[1]).toLowerCase().includes("compensation")
    );
    if (hasHeader) return name;
  }
  for (const name of wb.SheetNames) {
    const data = getSheetData(wb, name);
    const flat = data.flat().map(String).join(" ").toLowerCase();
    if (flat.includes("percent of effort") && flat.includes("compensation type")) {
      return name;
    }
  }
  return wb.SheetNames.find((n) => !n.toLowerCase().includes("parameter")) ?? wb.SheetNames[0];
}

interface MonthColumn {
  index: number;
  month: string;
  sourceType: SourceType;
}

export function parsePayrollFundingWorkbook(
  wb: WorkBook,
  fileName: string
): { snapshot: PayrollReportSnapshot; preview: ParsePreview } {
  const warnings: ParseWarning[] = [];
  const sheetName = detectPayrollSheet(wb);
  const sheet = wb.Sheets[sheetName];
  const data = getSheetData(wb, sheetName);
  const diagnostics: string[] = [];

  const readPercent = (rowIdx: number, colIdx: number, jsonValue: unknown): number | null =>
    parsePercentCell(sheet?.[XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })], jsonValue);

  const headerIdx = data.findIndex((row) =>
    String(row[0]).toLowerCase().includes("employee") &&
    String(row[1]).toLowerCase().includes("compensation")
  );

  if (headerIdx < 0) {
    warnings.push({
      id: generateId(),
      severity: "error",
      sheetName,
      message: "Could not find header row with Employee and Compensation Type columns.",
    });
    return buildFailedSnapshot(fileName, sheetName, wb.SheetNames, warnings, diagnostics);
  }

  let monthColumns = parseMonthHeaders(data, headerIdx, warnings, sheetName);
  diagnostics.push(`Header row: ${headerIdx}, month columns: ${monthColumns.length}`);

  if (monthColumns.length === 0) {
    warnings.push({
      id: generateId(),
      severity: "error",
      sheetName,
      message: "No month columns detected.",
    });
    return buildFailedSnapshot(fileName, sheetName, wb.SheetNames, warnings, diagnostics);
  }

  const employees: Employee[] = [];
  const fundingSourceMap = new Map<string, FundingSource>();
  /** Sum (X)+(Y) percent rows per employee / source / month */
  const allocationAcc = new Map<
    string,
    {
      employeeId: string;
      fundingSourceId: string;
      month: string;
      percentEffort: number;
      sourceType: SourceType;
      rawValue?: string;
    }
  >();
  const monthlyAllocations: MonthlyAllocation[] = [];
  const monthlyCosts: MonthlyCostRecord[] = [];
  const rawRows: RawParsedRow[] = [];

  let currentEmployee: Employee | null = null;
  let colorIdx = 0;
  const actualMonthSet = new Set(monthColumns.filter((m) => m.sourceType === "actual").map((m) => m.month));
  const futureMonthSet = new Set(monthColumns.filter((m) => m.sourceType === "future").map((m) => m.month));
  const allMonthSet = new Set(monthColumns.map((m) => m.month));

  const getOrCreateSource = (chartstring: string, label: string): FundingSource => {
    const key = chartstring || label;
    if (fundingSourceMap.has(key)) return fundingSourceMap.get(key)!;
    const fund = chartstring ? chartstringToFund(chartstring) : "";
    const fs: FundingSource = {
      id: generateId(),
      rawName: label.trim(),
      alias: chartstring ? `Fund ${fund}` : label.trim(),
      accountString: chartstring,
      projectId: chartstring ? chartstringToProjectId(chartstring) : undefined,
      fund: fund || undefined,
      color: FUNDING_COLORS[colorIdx++ % FUNDING_COLORS.length],
    };
    fundingSourceMap.set(key, fs);
    return fs;
  };

  const employeeIdsForSource = (sourceId: string): string[] => {
    const ids = new Set<string>();
    for (const acc of allocationAcc.values()) {
      if (acc.fundingSourceId === sourceId) ids.add(acc.employeeId);
    }
    return [...ids];
  };

  const inferEmployeeFromChartstring = (label: string): Employee | null => {
    const chart = extractChartstring(label) ?? label;
    const source = fundingSourceMap.get(chart) ?? fundingSourceMap.get(label);
    if (!source) return null;
    const ids = employeeIdsForSource(source.id);
    if (ids.length !== 1) return null;
    return employees.find((e) => e.id === ids[0]) ?? null;
  };

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    const col0 = String(row[0] ?? "").trim();
    const col1 = String(row[1] ?? "").trim();

    if (!col0 && !col1) continue;
    if (/^total\s/i.test(col1) || /^total\s/i.test(col0)) continue;

    if (isColumnHeaderRow(col0, col1)) {
      currentEmployee = null;
      const nextCols = parseMonthHeaders(data, i, warnings, sheetName);
      if (nextCols.length > 0) {
        monthColumns = nextCols;
        for (const mc of nextCols) {
          allMonthSet.add(mc.month);
          if (mc.sourceType === "actual") actualMonthSet.add(mc.month);
          if (mc.sourceType === "future") futureMonthSet.add(mc.month);
        }
      }
      continue;
    }

    if (isSectionBreak(col0, col1)) {
      currentEmployee = null;
      continue;
    }

    const rowType = detectRowType(col1);

    if (col0 && looksLikePersonName(col0)) {
      const parsed = parseEmployeeName(col0);
      if (!isSamePersonAsCurrent(currentEmployee, parsed)) {
        const existing = findExistingEmployee(employees, parsed);
        if (existing) {
          currentEmployee = existing;
        } else {
          currentEmployee = {
            id: generateId(),
            name: parsed.name,
            appointmentPercent: 100,
            employeeId: parsed.employeeId,
            role: extractRole(col0),
            compensationType: col1 || undefined,
            payFrequency: detectPayFrequency(col1),
          };
          employees.push(currentEmployee);
        }
      }
    }

    if (!currentEmployee) {
      if (rowType === "percentEffort" || rowType === "baseSalary") {
        const inferred = inferEmployeeFromChartstring(col1);
        if (inferred) {
          processFundingRow(
            row,
            inferred,
            col1,
            rowType,
            i,
            monthColumns,
            getOrCreateSource,
            allocationAcc,
            monthlyCosts,
            rawRows,
            sheetName,
            warnings,
            readPercent
          );
        }
      }
      continue;
    }

    if (rowType === "benefits" || rowType === "totalCompBenefits") {
      for (const mc of monthColumns) {
        const amt = parseCurrency(row[mc.index]);
        if (amt === null || amt === 0) continue;
        monthlyCosts.push({
          id: generateId(),
          employeeId: currentEmployee.id,
          month: mc.month,
          rowType,
          amount: amt,
          sourceType: mc.sourceType,
        });
      }
      rawRows.push({
        sheetName,
        rowNumber: i + 1,
        employeeId: currentEmployee.id,
        detectedRowType: rowType,
        label: col1,
        values: row,
      });
      continue;
    }

    if (rowType === "percentEffort" || rowType === "baseSalary") {
      processFundingRow(
        row,
        currentEmployee,
        col1,
        rowType,
        i,
        monthColumns,
        getOrCreateSource,
        allocationAcc,
        monthlyCosts,
        rawRows,
        sheetName,
        warnings,
        readPercent
      );
    }

    if (col1.includes("Total Percent of Effort")) {
      const totals = monthColumns.map((mc) => readPercent(i, mc.index, row[mc.index]) ?? 0);
      const maxPct = Math.max(...totals, 0);
      if (maxPct > 0 && maxPct <= 100) {
        currentEmployee.appointmentPercent = Math.round(maxPct);
      } else if (maxPct > 0 && maxPct <= 1) {
        currentEmployee.appointmentPercent = Math.round(maxPct * 100);
      }
    }
  }

  for (const acc of allocationAcc.values()) {
    if (!hasPercentEffort(acc.percentEffort)) continue;
    monthlyAllocations.push({
      id: generateId(),
      employeeId: acc.employeeId,
      fundingSourceId: acc.fundingSourceId,
      month: acc.month,
      percentEffort: Math.round(acc.percentEffort * 100) / 100,
      sourceType: acc.sourceType,
      status: "imported",
      rawValue: acc.rawValue,
    });
  }

  const months = [...allMonthSet].sort();
  const actualMonths = [...actualMonthSet].sort();
  const futureMonths = [...futureMonthSet].sort();

  if (employees.length === 0) {
    warnings.push({
      id: generateId(),
      severity: "error",
      sheetName,
      message: "No employees detected. Check report format.",
    });
  }

  const parseStatus: ParsePreview["parseStatus"] = warnings.some((w) => w.severity === "error")
    ? "failed"
    : warnings.some((w) => w.severity === "warning")
      ? "partial"
      : "success";

  const paramsData = wb.SheetNames.some((n) => n.toLowerCase().includes("parameter"))
    ? getSheetData(wb, wb.SheetNames.find((n) => n.toLowerCase().includes("parameter"))!)
  : [];

  let reportDate: string | undefined;
  for (const row of paramsData) {
    if (String(row[0]).toLowerCase().includes("report run date") && row[1]) {
      reportDate = row[1] instanceof Date ? row[1].toISOString() : String(row[1]);
    }
  }

  const snapshot: PayrollReportSnapshot = {
    id: generateId(),
    sourceFileName: fileName,
    uploadedAt: new Date().toISOString(),
    reportName: "Payroll Funding Report",
    reportDate,
    sheetName,
    parserVersion: PARSER_VERSION,
    parseStatus,
    parseWarnings: warnings,
    employees,
    fundingSources: [...fundingSourceMap.values()],
    monthlyAllocations,
    monthlyCosts,
    rawRows,
    monthRange: { start: months[0] ?? "", end: months[months.length - 1] ?? "" },
    actualMonths,
    futureMonths,
  };

  const preview: ParsePreview = {
    sheetNames: wb.SheetNames,
    selectedSheet: sheetName,
    employees: employees.length,
    fundingSources: fundingSourceMap.size,
    allocations: monthlyAllocations.length,
    costs: monthlyCosts.length,
    monthRange: snapshot.monthRange,
    parseStatus,
    warnings,
    sampleRows: rawRows.slice(0, 20),
    diagnostics,
  };

  return { snapshot, preview };
}

function isOtherCompEffortRow(label: string): boolean {
  return /percent of effort\s*\(z\)/i.test(label);
}

function allocationKey(employeeId: string, fundingSourceId: string, month: string): string {
  return `${employeeId}|${fundingSourceId}|${month}`;
}

function processFundingRow(
  row: unknown[],
  employee: Employee,
  col1: string,
  rowType: RowType,
  rowIdx: number,
  monthColumns: MonthColumn[],
  getOrCreateSource: (chart: string, label: string) => FundingSource,
  allocationAcc: Map<
    string,
    {
      employeeId: string;
      fundingSourceId: string;
      month: string;
      percentEffort: number;
      sourceType: SourceType;
      rawValue?: string;
    }
  >,
  monthlyCosts: MonthlyCostRecord[],
  rawRows: RawParsedRow[],
  sheetName: string,
  warnings: ParseWarning[],
  readPercent: (rowIdx: number, colIdx: number, jsonValue: unknown) => number | null
) {
  const chart = extractChartstring(col1) ?? col1;
  const source = getOrCreateSource(chart, col1);

  for (const mc of monthColumns) {
    const raw = row[mc.index];
    if (rowType === "percentEffort") {
      if (isOtherCompEffortRow(col1)) continue;
      const pct = readPercent(rowIdx, mc.index, raw);
      if (pct === null || pct === 0) continue;
      const key = allocationKey(employee.id, source.id, mc.month);
      const existing = allocationAcc.get(key);
      if (existing) {
        existing.percentEffort += pct;
      } else {
        allocationAcc.set(key, {
          employeeId: employee.id,
          fundingSourceId: source.id,
          month: mc.month,
          percentEffort: pct,
          sourceType: mc.sourceType,
          rawValue: String(raw),
        });
      }
    } else if (rowType === "baseSalary") {
      const amt = parseCurrency(raw);
      if (amt === null || amt === 0) continue;
      monthlyCosts.push({
        id: generateId(),
        employeeId: employee.id,
        fundingSourceId: source.id,
        month: mc.month,
        rowType: "baseSalary",
        amount: amt,
        sourceType: mc.sourceType,
      });
    }
  }

  rawRows.push({
    sheetName,
    rowNumber: rowIdx + 1,
    employeeId: employee.id,
    fundingSourceId: source.id,
    detectedRowType: rowType,
    label: col1,
    values: row,
  });
}

function parseMonthHeaders(
  data: unknown[][],
  headerIdx: number,
  warnings: ParseWarning[],
  sheetName: string
): MonthColumn[] {
  const headerRow = data[headerIdx];
  const sectionRow = data[headerIdx - 1] ?? [];

  let actualStart = -1;
  let futureStart = -1;
  sectionRow.forEach((cell, i) => {
    const s = String(cell).toLowerCase();
    if (s.includes("actual")) actualStart = i;
    if (s.includes("future")) futureStart = i;
  });

  const columns: MonthColumn[] = [];
  headerRow.forEach((cell, index) => {
    const month = parseMonthLabel(String(cell));
    if (!month) return;
    let sourceType: SourceType = "unknown";
    if (actualStart >= 0 && futureStart >= 0) {
      sourceType = index < futureStart ? "actual" : "future";
    } else if (actualStart >= 0 && index >= actualStart) {
      sourceType = "actual";
    } else if (futureStart >= 0 && index >= futureStart) {
      sourceType = "future";
    }
    columns.push({ index, month, sourceType });
  });

  if (columns.length === 0) {
    warnings.push({
      id: generateId(),
      severity: "warning",
      sheetName,
      message: "Month header parse used fallback — verify actual vs future months.",
    });
  }

  return columns;
}

function isColumnHeaderRow(col0: string, col1: string): boolean {
  return col0.toLowerCase().includes("employee") && col1.toLowerCase().includes("compensation");
}

function isSectionBreak(col0: string, col1: string): boolean {
  const blob = `${col0} ${col1}`.toLowerCase();
  if (looksLikePersonName(col0)) return false;
  return (
    blob.includes("future distribution") ||
    blob.includes("future distributions") ||
    /^future\s*(actuals)?$/i.test(col0.trim()) ||
    /^actuals?$/i.test(col0.trim())
  );
}

/** "Last, First" — not last name alone */
function looksLikePersonName(col0: string): boolean {
  if (!col0.includes(",")) return false;
  if (/^total/i.test(col0)) return false;
  return /^[A-Za-z][A-Za-z\s.'-]*,\s*[A-Za-z]/i.test(col0);
}

function findExistingEmployee(
  employees: Employee[],
  parsed: { name: string; employeeId?: string }
): Employee | undefined {
  if (parsed.employeeId) {
    const byHr = employees.find((e) => e.employeeId === parsed.employeeId);
    if (byHr) return byHr;
  }
  const n = normalizePersonName(parsed.name);
  if (!n) return undefined;
  return employees.find((e) => {
    if (normalizePersonName(e.name) !== n) return false;
    if (parsed.employeeId && e.employeeId && parsed.employeeId !== e.employeeId) return false;
    return true;
  });
}

function isSamePersonAsCurrent(
  current: Employee | null,
  parsed: { name: string; employeeId?: string }
): boolean {
  if (!current) return false;
  if (parsed.employeeId && current.employeeId) {
    return parsed.employeeId === current.employeeId;
  }
  return normalizePersonName(parsed.name) === normalizePersonName(current.name);
}

function extractRole(col0: string): string | undefined {
  const m = col0.match(/;\d+\s*-\s*([A-Z\s]+)/);
  return m?.[1]?.trim();
}

export function detectRowType(label: string): RowType {
  const l = label.toLowerCase();
  if (l.includes("percent of effort")) return "percentEffort";
  if (l.includes("base salary")) return "baseSalary";
  if (l === "benefits" || l.startsWith("benefits ")) return "benefits";
  if (l.includes("total compensation & benefit") || l.includes("total comp")) return "totalCompBenefits";
  return "other";
}

function buildFailedSnapshot(
  fileName: string,
  sheetName: string,
  sheetNames: string[],
  warnings: ParseWarning[],
  diagnostics: string[]
): { snapshot: PayrollReportSnapshot; preview: ParsePreview } {
  return {
    snapshot: {
      id: generateId(),
      sourceFileName: fileName,
      uploadedAt: new Date().toISOString(),
      reportName: "Payroll Funding Report",
      sheetName,
      parserVersion: PARSER_VERSION,
      parseStatus: "failed",
      parseWarnings: warnings,
      employees: [],
      fundingSources: [],
      monthlyAllocations: [],
      monthlyCosts: [],
      rawRows: [],
      monthRange: { start: "", end: "" },
      actualMonths: [],
      futureMonths: [],
    },
    preview: {
      sheetNames,
      selectedSheet: sheetName,
      employees: 0,
      fundingSources: 0,
      allocations: 0,
      costs: 0,
      monthRange: { start: "", end: "" },
      parseStatus: "failed",
      warnings,
      sampleRows: [],
      diagnostics,
    },
  };
}

export function previewWorkbook(wb: WorkBook, fileName: string) {
  return parsePayrollFundingWorkbook(wb, fileName);
}
