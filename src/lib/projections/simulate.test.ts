import { describe, expect, it } from "vitest";
import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayrollReportSnapshot,
  ProjectionRule,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { simulateProjections } from "@/lib/projections/simulate";
import { resolveHorizonMonths } from "@/lib/projections/horizon";

function emp(id = "e1"): Employee {
  return { id, name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001" };
}

function fs(id = "f1", account = "7000-1-7030720-45"): FundingSource {
  return { id, rawName: account, alias: "Grant A", accountString: account, fund: "7000", color: "#ccc" };
}

function alloc(
  month: string,
  pct: number,
  employeeId = "e1",
  fundingSourceId = "f1"
): MonthlyAllocation {
  return {
    id: `${employeeId}|${fundingSourceId}|${month}`,
    employeeId,
    fundingSourceId,
    month,
    percentEffort: pct,
    sourceType: month >= "2026-08" ? "future" : "actual",
    status: "imported",
  };
}

function costs(month: string, amount = 10000): MonthlyCostRecord[] {
  return [
    {
      id: `s-${month}`,
      employeeId: "e1",
      fundingSourceId: "f1",
      month,
      rowType: "baseSalary",
      amount: amount * 0.75,
      sourceType: "actual",
    },
    {
      id: `b-${month}`,
      employeeId: "e1",
      month,
      rowType: "benefits",
      amount: amount * 0.25,
      sourceType: "actual",
    },
    {
      id: `t-${month}`,
      employeeId: "e1",
      month,
      rowType: "totalCompBenefits",
      amount,
      sourceType: "actual",
    },
  ];
}

function snapshot(months: string[], extra?: Partial<PayrollReportSnapshot>): PayrollReportSnapshot {
  return {
    id: "snap",
    sourceFileName: "test.xlsx",
    uploadedAt: "2026-07-01T00:00:00.000Z",
    reportName: "test",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees: [emp()],
    fundingSources: [fs()],
    monthlyAllocations: months.map((m) => alloc(m, 100)),
    monthlyCosts: months.flatMap((m) => costs(m)),
    rawRows: [],
    monthRange: { start: months[0]!, end: months[months.length - 1]! },
    actualMonths: months.filter((m) => m < "2026-08"),
    futureMonths: months.filter((m) => m >= "2026-08"),
    ...extra,
  };
}

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function pctAt(
  result: ReturnType<typeof simulateProjections>,
  month: string,
  key = "7000-1-7030720-45",
  employeeId?: string
) {
  const state = result.states.find((s) => s.month === month);
  return (
    state?.allocations.find(
      (a) => a.chartstringKey === key && (employeeId ? a.employeeId === employeeId : true)
    )?.percentEffort ?? 0
  );
}

describe("resolveHorizonMonths", () => {
  it("defaults to 12 months from origin", () => {
    const months = resolveHorizonMonths("2026-08", { preset: "12" }, 7);
    expect(months[0]).toBe("2026-08");
    expect(months[months.length - 1]).toBe("2027-07");
    expect(months).toHaveLength(12);
  });

  it("uses remainder of FY", () => {
    const months = resolveHorizonMonths("2026-08", { preset: "fy" }, 7);
    expect(months[months.length - 1]).toBe("2027-06");
  });
});

describe("simulateProjections", () => {
  const now = new Date(2026, 7, 15); // Aug 2026

  it("carries origin mix forward with no rules", () => {
    const snap = snapshot(["2026-06", "2026-07", "2026-08"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings(),
      portfolio: new Map(),
      now,
    });
    expect(result.originMonth).toBe("2026-08");
    expect(pctAt(result, "2026-08")).toBe(100);
    expect(pctAt(result, "2026-11")).toBe(100);
  });

  it("ends a chartstring the month after onDate", () => {
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "onDate", month: "2026-09" },
      remainder: { kind: "uncovered" },
    };
    const snap = snapshot(["2026-07", "2026-08"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionRules: [rule] }),
      portfolio: new Map(),
      now,
    });
    expect(pctAt(result, "2026-09")).toBe(100);
    expect(pctAt(result, "2026-10")).toBe(0);
    expect(result.states.find((s) => s.month === "2026-10")?.coverageByEmployee.e1.status).toBe(
      "underallocated"
    );
  });

  it("moves leftover to another chartstring", () => {
    const planned = {
      id: "p1",
      chartstringKey: "planned:p1",
      alias: "Startup",
      color: "#ddd",
    };
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "onDate", month: "2026-08" },
      remainder: { kind: "moveTo", chartstringKey: "planned:p1" },
    };
    const snap = snapshot(["2026-07"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({
        projectionRules: [rule],
        plannedFundingSources: [planned],
      }),
      portfolio: new Map(),
      now,
    });
    expect(pctAt(result, "2026-09")).toBe(0);
    expect(pctAt(result, "2026-09", "planned:p1")).toBe(100);
  });

  it("zeros after roster employment end", () => {
    const snap = snapshot(["2026-07"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({
        employeeProfiles: {
          e1: { endDate: "2026-09-30" },
          "hr:1001": { endDate: "2026-09-30" },
        },
      }),
      portfolio: new Map(),
      now,
    });
    expect(pctAt(result, "2026-09")).toBe(100);
    expect(pctAt(result, "2026-10")).toBe(0);
  });

  it("comes off after a dollar cap envelope", () => {
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "dollarCap", amount: 25000, fromMonth: "2026-08" },
      remainder: { kind: "uncovered" },
    };
    const snap = snapshot(["2026-07"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionRules: [rule], projectionHorizon: { preset: "6" } }),
      portfolio: new Map(),
      now,
    });
    expect(pctAt(result, "2026-08")).toBe(100);
    expect(pctAt(result, "2026-09")).toBe(100);
    expect(pctAt(result, "2026-10")).toBe(100);
    expect(pctAt(result, "2026-11")).toBe(0);
  });

  it("depletes a shared account then comes off the next month", () => {
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "fundsDepleted" },
      remainder: { kind: "uncovered" },
    };
    const snap = snapshot(["2026-07"]);
    const portfolio = new Map([
      [
        "7000-1-7030720-45",
        {
          chartstring: "7000-1-7030720-45",
          balance: 15000,
          reportRunDate: "2026-07-31",
          sourceFileName: "mp.xlsx",
        },
      ],
    ]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionRules: [rule], projectionHorizon: { preset: "6" } }),
      portfolio,
      now,
    });
    expect(pctAt(result, "2026-08")).toBe(100);
    expect(pctAt(result, "2026-09")).toBe(100);
    expect(pctAt(result, "2026-10")).toBe(0);
    const augRemain = result.states.find((s) => s.month === "2026-08")?.remainingByRoot["7000-1-7030720"];
    expect(augRemain).toBe(5000);
  });

  it("flags a conflict when payroll still has effort after a past date rule", () => {
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "onDate", month: "2026-06" },
      remainder: { kind: "uncovered" },
    };
    const snap = snapshot(["2026-07", "2026-08"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionRules: [rule] }),
      portfolio: new Map(),
      now,
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(pctAt(result, "2026-08")).toBe(100);
  });

  it("applies a past date rule when origin is ahead of payroll", () => {
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "onDate", month: "2026-06" },
      remainder: { kind: "uncovered" },
    };
    const snap = snapshot(["2026-06", "2026-07"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionRules: [rule] }),
      portfolio: new Map(),
      now,
    });
    expect(result.staleness.payrollStale).toBe(true);
    expect(pctAt(result, "2026-08")).toBe(0);
  });

  it("counts payroll actuals toward a dollar cap envelope", () => {
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "dollarCap", amount: 15000, fromMonth: "2026-07" },
      remainder: { kind: "uncovered" },
    };
    const snap = snapshot(["2026-07"]);
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionRules: [rule], projectionHorizon: { preset: "6" } }),
      portfolio: new Map(),
      now,
    });
    // July $10k already counted; Aug $10k hits 20k >= 15k; off from Sep
    expect(pctAt(result, "2026-08")).toBe(100);
    expect(pctAt(result, "2026-09")).toBe(0);
  });

  it("does not apply imported months after origin to a different person", () => {
    const vincent: Employee = {
      id: "v",
      name: "Vincent Chan",
      appointmentPercent: 100,
      employeeId: "025926122",
    };
    const ohnmar: Employee = {
      id: "o",
      name: "Ohnmar Chan",
      appointmentPercent: 100,
      employeeId: "029683794",
    };
    const immuno: FundingSource = {
      id: "immuno",
      rawName: "7702322",
      alias: "ImmunoX",
      accountString: "7000-1-7702322-45",
      fund: "7000",
      color: "#ccc",
    };
    const fund5018: FundingSource = {
      id: "f5018",
      rawName: "2000969",
      alias: "Fund 5018",
      accountString: "5000-1-2000969-45",
      fund: "5000",
      color: "#ddd",
    };
    const snap = snapshot(["2026-08"], {
      employees: [vincent, ohnmar],
      fundingSources: [immuno, fund5018],
      monthlyAllocations: [
        alloc("2026-08", 55.3, "v", "immuno"),
        alloc("2026-08", 100, "o", "f5018"),
        alloc("2026-09", 55.3, "o", "immuno"),
        alloc("2026-09", 100, "o", "f5018"),
        alloc("2026-10", 55.3, "o", "immuno"),
        alloc("2026-10", 100, "o", "f5018"),
      ],
      monthlyCosts: [
        ...costs("2026-08"),
        ...costs("2026-08").map((c) => ({ ...c, id: `${c.id}-o`, employeeId: "o" })),
      ],
      futureMonths: ["2026-08", "2026-09", "2026-10"],
      actualMonths: [],
      monthRange: { start: "2026-08", end: "2026-10" },
    });
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionHorizon: { preset: "6" } }),
      portfolio: new Map(),
      now,
    });
    expect(pctAt(result, "2026-08", "7000-1-7702322-45", "v")).toBe(55.3);
    expect(pctAt(result, "2026-09", "7000-1-7702322-45", "v")).toBe(55.3);
    expect(pctAt(result, "2026-09", "7000-1-7702322-45", "o")).toBe(0);
    expect(pctAt(result, "2026-09", "5000-1-2000969-45", "o")).toBe(100);
    expect(result.states.find((s) => s.month === "2026-09")?.coverageByEmployee.v?.allocatedPercent).toBe(
      55.3
    );
    expect(result.states.find((s) => s.month === "2026-09")?.coverageByEmployee.o?.allocatedPercent).toBe(
      100
    );
  });

  it("includes a payroll reversal in origin coverage and does not carry it forward", () => {
    const home = fs("f1", "7000-1-7030720-45");
    const extra = fs("f2", "19900-44-146328D-45");
    const reversal = fs("f3", "4000-44-WRONG-45");
    extra.alias = "Project 146328D";
    reversal.alias = "Wrong account";
    const snap = snapshot(["2026-07", "2026-08"], {
      fundingSources: [home, extra, reversal],
      monthlyAllocations: [
        alloc("2026-07", 75, "e1", "f1"),
        alloc("2026-07", 25, "e1", "f2"),
        alloc("2026-08", 100, "e1", "f1"),
        alloc("2026-08", 25, "e1", "f2"),
        alloc("2026-08", -25, "e1", "f3"),
      ],
    });
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({ projectionHorizon: { preset: "6" } }),
      portfolio: new Map(),
      now,
    });
    expect(result.states.find((s) => s.month === "2026-08")?.coverageByEmployee.e1?.allocatedPercent).toBe(
      100
    );
    expect(pctAt(result, "2026-08", "4000-44-wrong-45")).toBe(-25);
    expect(pctAt(result, "2026-09", "4000-44-wrong-45")).toBe(0);
    expect(result.states.find((s) => s.month === "2026-09")?.coverageByEmployee.e1?.allocatedPercent).toBe(
      125
    );
  });

  it("keeps hidden timeline/runway funds in the mix so they are not uncovered", () => {
    const home = fs("f1", "7000-1-7030720-45");
    const extra = fs("f2", "19900-44-146328D-45");
    extra.alias = "Project 146328D";
    const snap = snapshot(["2026-07", "2026-08"], {
      fundingSources: [home, extra],
      monthlyAllocations: [
        alloc("2026-07", 60, "e1", "f1"),
        alloc("2026-07", 40, "e1", "f2"),
        alloc("2026-08", 60, "e1", "f1"),
        alloc("2026-08", 40, "e1", "f2"),
      ],
    });
    const result = simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: settings({
        projectionHorizon: { preset: "6" },
        hiddenEmployeeFunds: ["e1|f2"],
      }),
      portfolio: new Map(),
      now,
    });
    expect(pctAt(result, "2026-08", "19900-44-146328d-45")).toBe(40);
    expect(pctAt(result, "2026-09", "19900-44-146328d-45")).toBe(40);
    const origin = result.states.find((s) => s.month === "2026-08")?.coverageByEmployee.e1;
    const later = result.states.find((s) => s.month === "2026-09")?.coverageByEmployee.e1;
    expect(origin?.allocatedPercent).toBe(100);
    expect(origin?.unallocatedPercent).toBe(0);
    expect(origin?.status).toBe("fullyCovered");
    expect(later?.allocatedPercent).toBe(100);
    expect(later?.status).toBe("fullyCovered");
  });
});
