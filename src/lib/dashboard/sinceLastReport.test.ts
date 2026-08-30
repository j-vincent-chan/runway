import { describe, expect, it } from "vitest";
import {
  buildSinceLastReport,
  buildSinceLastReportSentence,
  type SinceLastReportSummary,
} from "@/lib/dashboard/sinceLastReport";
import { DEFAULT_SETTINGS } from "@/types";
import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayrollReportImport,
  PayrollReportSnapshot,
  WorkingPlan,
} from "@/types";
import type { AccountBalance } from "@/lib/funding/accountBalances";

function emp(id: string, name: string, hrId: string): Employee {
  return { id, name, appointmentPercent: 100, employeeId: hrId };
}

function fs(id = "f1", account = "7000-1-7030720-45", alias = "Grant A"): FundingSource {
  return { id, rawName: account, alias, accountString: account, fund: "7000", color: "#ccc" };
}

function alloc(month: string, employeeId: string, fundingSourceId: string, pct = 100): MonthlyAllocation {
  return {
    id: `${employeeId}|${fundingSourceId}|${month}`,
    employeeId,
    fundingSourceId,
    month,
    percentEffort: pct,
    sourceType: "actual",
    status: "imported",
  };
}

function costRows(month: string, employeeId: string, fundingSourceId: string, total = 10_000): MonthlyCostRecord[] {
  return [
    {
      id: `s-${employeeId}-${month}`,
      employeeId,
      fundingSourceId,
      month,
      rowType: "baseSalary",
      amount: total * 0.75,
      sourceType: "actual",
    },
    { id: `b-${employeeId}-${month}`, employeeId, month, rowType: "benefits", amount: total * 0.25, sourceType: "actual" },
    { id: `t-${employeeId}-${month}`, employeeId, month, rowType: "totalCompBenefits", amount: total, sourceType: "actual" },
  ];
}

function snapshot(opts: {
  id: string;
  uploadedAt: string;
  employees: Employee[];
  months: string[];
  fundingSources: FundingSource[];
  allocations: MonthlyAllocation[];
  costs: MonthlyCostRecord[];
}): PayrollReportSnapshot {
  return {
    id: opts.id,
    sourceFileName: "payroll.xlsx",
    uploadedAt: opts.uploadedAt,
    reportName: "t",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees: opts.employees,
    fundingSources: opts.fundingSources,
    monthlyAllocations: opts.allocations,
    monthlyCosts: opts.costs,
    rawRows: [],
    monthRange: { start: opts.months[0]!, end: opts.months[opts.months.length - 1]! },
    actualMonths: opts.months,
    futureMonths: [],
  };
}

function payrollImport(snap: PayrollReportSnapshot): PayrollReportImport {
  return {
    id: `imp-${snap.uploadedAt}`,
    sourceFileName: snap.sourceFileName,
    uploadedAt: snap.uploadedAt,
    monthRange: snap.monthRange,
    employeeCount: snap.employees.length,
    fundingSourceCount: snap.fundingSources.length,
    parseStatus: "success",
    snapshot: snap,
  };
}

const settings: AppSettings = { ...DEFAULT_SETTINGS };

function balances(balance: number, account = "7000-1-7030720-45"): Map<string, AccountBalance> {
  return new Map([
    [account, { chartstring: account, balance, reportRunDate: "2026-08-01", sourceFileName: "mp.xlsx" }],
  ]);
}

const fs1 = fs();
const ada = emp("e1", "Ada Lovelace", "1001");
const bea = emp("e2", "Bea Okafor", "1002");

const priorSnapshot = snapshot({
  id: "snap-1",
  uploadedAt: "2026-07-01T00:00:00.000Z",
  employees: [ada],
  months: ["2026-07"],
  fundingSources: [fs1],
  allocations: [alloc("2026-07", ada.id, fs1.id)],
  costs: costRows("2026-07", ada.id, fs1.id, 10_000),
});

const currentSnapshot = snapshot({
  id: "snap-1", // foldPayrollImports keeps the first import's id
  uploadedAt: "2026-08-01T00:00:00.000Z",
  employees: [ada, bea],
  months: ["2026-07", "2026-08"],
  fundingSources: [fs1],
  allocations: [
    alloc("2026-07", ada.id, fs1.id),
    alloc("2026-08", ada.id, fs1.id),
    alloc("2026-08", bea.id, fs1.id),
  ],
  costs: [
    ...costRows("2026-07", ada.id, fs1.id, 10_000),
    ...costRows("2026-08", ada.id, fs1.id, 10_000),
    ...costRows("2026-08", bea.id, fs1.id, 5_000),
  ],
});

const priorImport = payrollImport(priorSnapshot);
const currentImport = payrollImport(currentSnapshot);

function baseArgs(workingPlan: WorkingPlan | null = null) {
  return {
    payrollImports: [priorImport, currentImport],
    currentSnapshot,
    currentPlanningMonth: "2026-08",
    currentMonthlyBurn: 15_000,
    currentRunwayMonths: 20,
    workingPlan,
    fundingSources: [fs1],
    settings,
    balances: balances(50_000),
  };
}

describe("buildSinceLastReport", () => {
  it("returns null with fewer than 2 imports", () => {
    expect(
      buildSinceLastReport({ ...baseArgs(), payrollImports: [currentImport] })
    ).toBeNull();
  });

  it("reconstructs the prior snapshot and diffs cost, roster, and runway against it", () => {
    const summary = buildSinceLastReport(baseArgs());
    expect(summary).not.toBeNull();
    expect(summary!.priorLabel).toBe("Jul 26");
    // prior trailing burn is Ada's $10,000 July total; current is the given $15,000.
    expect(summary!.costDeltaPct).toBeCloseTo(0.5, 5);
    expect(summary!.newHireNames).toEqual(["Bea Okafor"]);
    expect(summary!.departureNames).toEqual([]);
    expect(typeof summary!.priorRunwayMonths).toBe("number");
    expect(summary!.currentRunwayMonths).toBe(20);
    expect(summary!.runwayDeltaMonths).toBeCloseTo(20 - summary!.priorRunwayMonths!, 5);
  });

  it("does not leak today's working-plan edits into the prior-report baseline", () => {
    // Backdates Bea into the prior month — if this leaked into the prior-side
    // calculation she'd wrongly stop looking like a new hire.
    const leakyPlan: WorkingPlan = {
      snapshotId: currentSnapshot.id,
      allocations: [alloc("2026-07", bea.id, fs1.id)],
      updatedAt: "2026-08-01T00:00:00.000Z",
    };

    const withoutEdit = buildSinceLastReport(baseArgs(null));
    const withEdit = buildSinceLastReport(baseArgs(leakyPlan));

    expect(withEdit!.newHireNames).toEqual(withoutEdit!.newHireNames);
    expect(withEdit!.priorRunwayMonths).toBe(withoutEdit!.priorRunwayMonths);
  });
});

describe("buildSinceLastReportSentence", () => {
  const base: SinceLastReportSummary = {
    priorLabel: "Jul 26",
    costDeltaPct: null,
    newHireNames: [],
    departureNames: [],
    priorRunwayMonths: null,
    currentRunwayMonths: null,
    runwayDeltaMonths: null,
  };

  it("states no material change when nothing crosses materiality", () => {
    expect(buildSinceLastReportSentence(base)).toBe("No material change since the Jul 26 report.");
  });

  it("states a cost change alone when there is no runway consequence yet", () => {
    expect(buildSinceLastReportSentence({ ...base, costDeltaPct: 0.12 })).toBe("Personnel cost rose 12%.");
    expect(buildSinceLastReportSentence({ ...base, costDeltaPct: -0.12 })).toBe("Personnel cost fell 12%.");
  });

  it("ignores a cost swing below the materiality threshold", () => {
    expect(buildSinceLastReportSentence({ ...base, costDeltaPct: 0.005 })).toBe(
      "No material change since the Jul 26 report."
    );
  });

  it("pairs facts with the runway consequence using the task's own separator", () => {
    const summary: SinceLastReportSummary = {
      ...base,
      costDeltaPct: -0.12,
      currentRunwayMonths: 15.9,
      runwayDeltaMonths: 0.4,
    };
    expect(buildSinceLastReportSentence(summary)).toBe(
      "Personnel cost fell 12% — runway extended by 0.4 months, to 15.9 months."
    );
  });

  it("states the runway consequence alone when there are no other facts", () => {
    const summary: SinceLastReportSummary = { ...base, currentRunwayMonths: 15.9, runwayDeltaMonths: -0.4 };
    expect(buildSinceLastReportSentence(summary)).toBe("Runway shortened by 0.4 months, to 15.9 months.");
  });

  it("ignores a runway swing below the materiality threshold", () => {
    const summary: SinceLastReportSummary = { ...base, currentRunwayMonths: 15.9, runwayDeltaMonths: 0.02 };
    expect(buildSinceLastReportSentence(summary)).toBe("No material change since the Jul 26 report.");
  });

  it("states the delta without a month-denominated endpoint once overdrawn", () => {
    // The rest of the dashboard states an overdrawn state as a dollar deficit
    // (Shortest runway anchor), never a negative month count — this sentence
    // should state the change, not a confusing "-0.6 months" endpoint.
    const summary: SinceLastReportSummary = { ...base, currentRunwayMonths: -0.6, runwayDeltaMonths: 0.1 };
    expect(buildSinceLastReportSentence(summary)).toBe("Runway extended by 0.1 months.");
  });

  it("never states a runway consequence when the current figure is unknown", () => {
    const summary: SinceLastReportSummary = { ...base, runwayDeltaMonths: 5, currentRunwayMonths: null };
    expect(buildSinceLastReportSentence(summary)).toBe("No material change since the Jul 26 report.");
  });

  it("names one, two, three, and 4+ hires with correct joining and capping", () => {
    expect(buildSinceLastReportSentence({ ...base, newHireNames: ["Ada"] })).toBe("Ada joined.");
    expect(buildSinceLastReportSentence({ ...base, newHireNames: ["Ada", "Bea"] })).toBe("Ada and Bea joined.");
    expect(buildSinceLastReportSentence({ ...base, newHireNames: ["Ada", "Bea", "Cy"] })).toBe(
      "Ada, Bea and Cy joined."
    );
    expect(buildSinceLastReportSentence({ ...base, newHireNames: ["Ada", "Bea", "Cy", "Deb"] })).toBe(
      "Ada, Bea, Cy, and 1 more joined."
    );
  });

  it("states joins and departures together", () => {
    const summary: SinceLastReportSummary = { ...base, newHireNames: ["Ada"], departureNames: ["Bea"] };
    expect(buildSinceLastReportSentence(summary)).toBe("Ada joined; Bea left.");
  });
});
