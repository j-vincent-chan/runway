import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayrollReportImport,
  PayrollReportSnapshot,
  PlannedHire,
  ProjectionRule,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import type { AccountBalance } from "@/lib/funding/accountBalances";
import { plannedPersonKey } from "@/lib/reconciliation/plans";

/**
 * The worked example from the handoff, as fixtures for the reconciliation
 * tests: Ada has been on payroll all year; "Ruiz, Ana" is new in the Aug 2026
 * report, first charged in August (a partial month, $4,290), with the payroll
 * system's future rows saying 100% Startup; the PI planned a "Postdoc (TBD)"
 * for September at 60% R01 / 40% Startup. Origin is September 2026.
 */
export const KEY_A = "7000-1-7030720-45";
export const KEY_B = "7000-1-7030723-45";
export const NOW = new Date(2026, 8, 15); // Sep 2026 origin
export const ACTUAL_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
export const FUTURE_MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12"];

export function fsA(): FundingSource {
  return { id: "f1", rawName: KEY_A, alias: "Startup", accountString: KEY_A, color: "#ccc" };
}
export function fsB(): FundingSource {
  return { id: "f2", rawName: KEY_B, alias: "R01", accountString: KEY_B, color: "#ddd" };
}
export function ada(): Employee {
  return { id: "e1", name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001", role: "RSCH DATA ANL" };
}
export function ana(): Employee {
  return { id: "e2", name: "Ruiz, Ana", appointmentPercent: 100, employeeId: "02987654", role: "POSTDOC EMPLOYEE" };
}

export function alloc(
  employeeId: string,
  fundingSourceId: string,
  month: string,
  pct: number,
  sourceType: "actual" | "future"
): MonthlyAllocation {
  return {
    id: `${employeeId}|${fundingSourceId}|${month}`,
    employeeId,
    fundingSourceId,
    month,
    percentEffort: pct,
    sourceType,
    status: "imported",
  };
}

export function costs(employeeId: string, month: string, total: number, fundingSourceId = "f1"): MonthlyCostRecord[] {
  return [
    { id: `s-${employeeId}-${month}`, employeeId, fundingSourceId, month, rowType: "baseSalary", amount: total * 0.75, sourceType: "actual" },
    { id: `b-${employeeId}-${month}`, employeeId, month, rowType: "benefits", amount: total * 0.25, sourceType: "actual" },
    { id: `t-${employeeId}-${month}`, employeeId, month, rowType: "totalCompBenefits", amount: total, sourceType: "actual" },
  ];
}

export function snapshot(input: {
  id?: string;
  employees: Employee[];
  allocations: MonthlyAllocation[];
  costs: MonthlyCostRecord[];
  actualMonths: string[];
  futureMonths?: string[];
  reportDate?: string;
  sourceFileName?: string;
}): PayrollReportSnapshot {
  const months = [...input.actualMonths, ...(input.futureMonths ?? [])].sort();
  return {
    id: input.id ?? "snap",
    sourceFileName: input.sourceFileName ?? "payroll.xlsx",
    uploadedAt: "2026-09-01T12:00:00.000Z",
    reportName: "Payroll Funding Report",
    reportDate: input.reportDate,
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees: input.employees,
    fundingSources: [fsA(), fsB()],
    monthlyAllocations: input.allocations,
    monthlyCosts: input.costs,
    rawRows: [],
    monthRange: { start: months[0]!, end: months[months.length - 1]! },
    actualMonths: input.actualMonths,
    futureMonths: input.futureMonths ?? [],
  };
}

/** Every report before the Aug 2026 one: Ada alone, January through July. */
export function previousSnapshot(): PayrollReportSnapshot {
  const months = ACTUAL_MONTHS.slice(0, 7);
  return snapshot({
    id: "snap-prev",
    sourceFileName: "payroll-jul.xlsx",
    employees: [ada()],
    allocations: months.map((m) => alloc("e1", "f1", m, 100, "actual")),
    costs: months.flatMap((m) => costs("e1", m, 10000)),
    actualMonths: months,
    reportDate: "2026-08-02T12:00:00.000Z",
  });
}

/** The Aug 2026 report, run Aug 16 with August in progress: Ada plus the new Ana. */
export function currentSnapshot(patch: Partial<Parameters<typeof snapshot>[0]> = {}): PayrollReportSnapshot {
  return snapshot({
    id: "snap-cur",
    sourceFileName: "payroll-aug.xlsx",
    employees: [ada(), ana()],
    allocations: [
      ...ACTUAL_MONTHS.map((m) => alloc("e1", "f1", m, 100, "actual")),
      ...FUTURE_MONTHS.map((m) => alloc("e1", "f1", m, 100, "future")),
      alloc("e2", "f1", "2026-08", 100, "actual"),
      ...FUTURE_MONTHS.map((m) => alloc("e2", "f1", m, 100, "future")),
    ],
    costs: [
      ...ACTUAL_MONTHS.flatMap((m) => costs("e1", m, 10000)),
      ...costs("e2", "2026-08", 4290),
    ],
    actualMonths: ACTUAL_MONTHS,
    futureMonths: FUTURE_MONTHS,
    reportDate: "2026-08-16T12:00:00.000Z",
    ...patch,
  });
}

export function plan(patch: Partial<PlannedHire> = {}): PlannedHire {
  return {
    id: "p1",
    displayName: "Postdoc (TBD)",
    role: "Postdoctoral scholar",
    startMonth: "2026-09",
    appointmentPercent: 100,
    annualSalary: 72000,
    benefitsRatePct: 32,
    createdAt: "2026-06-18T12:00:00.000Z",
    createdBy: "pi@ucsf.edu",
    ...patch,
  };
}

/** 60% R01 / 40% Startup from the start month, applied from origin — what the form writes. */
export function planRules(planId = "p1", startMonth = "2026-09"): ProjectionRule[] {
  const personKey = plannedPersonKey(planId);
  return [
    { id: `${planId}-r1`, personKey, chartstringKey: KEY_B, trigger: { type: "setEffort", fromMonth: startMonth, percentEffort: 60 }, remainder: { kind: "uncovered" }, applyOverPayroll: true },
    { id: `${planId}-r2`, personKey, chartstringKey: KEY_A, trigger: { type: "setEffort", fromMonth: startMonth, percentEffort: 40 }, remainder: { kind: "uncovered" }, applyOverPayroll: true },
  ];
}

export function settingsWith(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, plannedHires: [plan()], projectionRules: planRules(), ...patch };
}

export function balances(): Map<string, AccountBalance> {
  return new Map<string, AccountBalance>([
    [KEY_A, { balance: 120000 } as AccountBalance],
    [KEY_B, { balance: 400000 } as AccountBalance],
  ]);
}

export function importOf(snap: PayrollReportSnapshot, uploadedAt: string, id = snap.id): PayrollReportImport {
  return {
    id,
    sourceFileName: snap.sourceFileName,
    uploadedAt,
    monthRange: snap.monthRange,
    employeeCount: snap.employees.length,
    fundingSourceCount: snap.fundingSources.length,
    parseStatus: "success",
    snapshot: snap,
  };
}
