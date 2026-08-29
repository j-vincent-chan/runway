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
import {
  buildChangeSummary,
  changeSummarySentences,
  type ChangeRequestDetails,
} from "@/lib/projections/changeSummary";

const KEY_A = "7000-1-7030720-45";
const NOW = new Date(2026, 7, 15); // Aug 2026

function emp(): Employee {
  return { id: "e1", name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001" };
}

function fs(): FundingSource {
  return { id: "f1", rawName: KEY_A, alias: "Grant A", accountString: KEY_A, color: "#ccc" };
}

function alloc(month: string): MonthlyAllocation {
  return {
    id: `e1|f1|${month}`,
    employeeId: "e1",
    fundingSourceId: "f1",
    month,
    percentEffort: 100,
    sourceType: month >= "2026-08" ? "future" : "actual",
    status: "imported",
  };
}

function costs(month: string, amount = 10000): MonthlyCostRecord[] {
  return [
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

function snapshot(months: string[]): PayrollReportSnapshot {
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
    monthlyAllocations: months.map(alloc),
    monthlyCosts: months.flatMap((m) => costs(m)),
    rawRows: [],
    monthRange: { start: months[0]!, end: months[months.length - 1]! },
    actualMonths: months.filter((m) => m < "2026-08"),
    futureMonths: months.filter((m) => m >= "2026-08"),
  };
}

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function build(rules: ProjectionRule[]): ChangeRequestDetails {
  return buildChangeSummary({
    snapshot: snapshot(["2026-06", "2026-07", "2026-08"]),
    workingPlan: null,
    settings: settings({ projectionRules: rules }),
    balances: new Map(),
    employeeId: "e1",
    personKey: "hr:1001",
    personName: "Ada Lovelace",
    aliasFor: (key) => (key === KEY_A ? "Grant A" : key),
    now: NOW,
  });
}

describe("buildChangeSummary", () => {
  it("yields no lines when the person has no rules", () => {
    const details = build([]);
    expect(details.lines).toEqual([]);
    expect(details.rules).toEqual([]);
    expect(changeSummarySentences(details)).toEqual([]);
  });

  it("captures an onDate rule as a run of changed months", () => {
    const details = build([
      {
        id: "r1",
        personKey: "hr:1001",
        chartstringKey: KEY_A,
        trigger: { type: "onDate", month: "2026-09" },
        remainder: { kind: "uncovered" },
      },
    ]);
    expect(details.rules).toHaveLength(1);
    expect(details.lines).toHaveLength(1);
    const line = details.lines[0]!;
    expect(line.accountLabel).toBe("Grant A");
    // Off after Sep 2026 ⇒ every later horizon month drops 100 → 0.
    expect(line.months[0]?.month).toBe("2026-10");
    expect(line.months[0]).toMatchObject({ beforePercent: 100, afterPercent: 0 });
    expect(line.months.every((m) => m.afterPercent === 0)).toBe(true);

    const [sentence] = changeSummarySentences(details);
    expect(sentence).toBe("Grant A: 100% → 0% from Oct 2026 through Jul 2027");
  });

  it("shows both accounts when a moveTo rule shifts effort", () => {
    const details = build([
      {
        id: "r1",
        personKey: "hr:1001",
        chartstringKey: KEY_A,
        trigger: { type: "onDate", month: "2026-08" },
        remainder: { kind: "moveTo", chartstringKey: "planned:p1" },
      },
    ]);
    const keys = details.lines.map((l) => l.chartstringKey);
    expect(keys).toContain(KEY_A);
    expect(keys).toContain("planned:p1");
    const moved = details.lines.find((l) => l.chartstringKey === "planned:p1")!;
    expect(moved.months[0]).toMatchObject({ beforePercent: 0, afterPercent: 100 });
  });

  it("uses singular phrasing for a single changed month", () => {
    const details: ChangeRequestDetails = {
      version: 1,
      personKey: "hr:1001",
      personName: "Ada Lovelace",
      capturedAt: "2026-08-15T00:00:00.000Z",
      rules: [],
      lines: [
        {
          chartstringKey: KEY_A,
          accountLabel: "Grant A",
          months: [
            {
              month: "2026-10",
              beforePercent: 50,
              afterPercent: 25,
              beforeMonthlyBurn: 5000,
              afterMonthlyBurn: 2500,
            },
          ],
        },
      ],
    };
    expect(changeSummarySentences(details)).toEqual(["Grant A: 50% → 25% in Oct 2026"]);
  });

  it("splits non-uniform changes into then-segments", () => {
    const details: ChangeRequestDetails = {
      version: 1,
      personKey: "hr:1001",
      personName: "Ada Lovelace",
      capturedAt: "2026-08-15T00:00:00.000Z",
      rules: [],
      lines: [
        {
          chartstringKey: KEY_A,
          accountLabel: "Grant A",
          months: [
            {
              month: "2026-10",
              beforePercent: 100,
              afterPercent: 50,
              beforeMonthlyBurn: 0,
              afterMonthlyBurn: 0,
            },
            {
              month: "2026-11",
              beforePercent: 100,
              afterPercent: 50,
              beforeMonthlyBurn: 0,
              afterMonthlyBurn: 0,
            },
            {
              month: "2026-12",
              beforePercent: 100,
              afterPercent: 0,
              beforeMonthlyBurn: 0,
              afterMonthlyBurn: 0,
            },
          ],
        },
      ],
    };
    expect(changeSummarySentences(details)).toEqual([
      "Grant A: 100% → 50% from Oct 2026 through Nov 2026, then 100% → 0% in Dec 2026",
    ]);
  });
});
