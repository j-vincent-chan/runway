import { describe, expect, it } from "vitest";
import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  PayrollReportSnapshot,
  PlannedFundingSource,
  ProjectionRule,
  WorkingPlan,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { applyChartstringRemoval, checkChartstringRemoval } from "@/lib/projections/removal";

const KEY_A = "7000-1-7030720-45";
const KEY_PLANNED = "planned:p1";

function emp(id = "e1"): Employee {
  return { id, name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001" };
}

function fs(id = "f1", account = KEY_A): FundingSource {
  return { id, rawName: account, alias: "Grant A", accountString: account, color: "#ccc" };
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
    sourceType: "actual",
    status: "imported",
  };
}

function snapshot(allocations: MonthlyAllocation[]): PayrollReportSnapshot {
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
    monthlyAllocations: allocations,
    monthlyCosts: [],
    rawRows: [],
    monthRange: { start: "2026-01", end: "2026-06" },
    actualMonths: ["2026-01"],
    futureMonths: [],
  };
}

function rule(patch: Partial<ProjectionRule> = {}): ProjectionRule {
  return {
    id: "r1",
    personKey: "hr:1001",
    chartstringKey: KEY_A,
    trigger: { type: "onDate", month: "2026-09" },
    remainder: { kind: "uncovered" },
    ...patch,
  };
}

function planned(patch: Partial<PlannedFundingSource> = {}): PlannedFundingSource {
  return { id: "p1", chartstringKey: KEY_PLANNED, alias: "New R01", color: "#abc", ...patch };
}

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function base(overrides: Partial<Parameters<typeof checkChartstringRemoval>[0]> = {}) {
  return {
    snapshot: null as PayrollReportSnapshot | null,
    workingPlan: null as WorkingPlan | null,
    settings: settings(),
    employeeId: "e1",
    personKey: "hr:1001",
    chartstringKey: KEY_A,
    ...overrides,
  };
}

describe("checkChartstringRemoval", () => {
  it("blocks when imported payroll pairs the person with the chartstring", () => {
    const check = checkChartstringRemoval(
      base({ snapshot: snapshot([alloc("2026-01", 50), alloc("2026-02", 50)]) })
    );
    expect(check).toEqual({
      removable: false,
      reason: "importedAllocations",
      allocationCount: 2,
      months: ["2026-01", "2026-02"],
    });
  });

  it("blocks when the pairing exists only through a working-plan edit", () => {
    const plan: WorkingPlan = {
      id: "wp",
      snapshotId: "snap",
      name: "plan",
      allocations: [alloc("2026-03", 25)],
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const check = checkChartstringRemoval(
      base({ snapshot: snapshot([]), workingPlan: plan })
    );
    expect(check.removable).toBe(false);
  });

  it("does not block on another person's imported allocations", () => {
    const check = checkChartstringRemoval(
      base({ snapshot: snapshot([alloc("2026-01", 100, "e2")]) })
    );
    expect(check.removable).toBe(true);
  });

  it("removes a rules-only pairing and repairs this person's moveTo remainders", () => {
    const s = settings({
      projectionRules: [
        rule(),
        rule({
          id: "r2",
          chartstringKey: "other-key",
          remainder: { kind: "moveTo", chartstringKey: KEY_A },
        }),
        // Another person's moveTo stays untouched.
        rule({
          id: "r3",
          personKey: "hr:2002",
          chartstringKey: "other-key",
          remainder: { kind: "moveTo", chartstringKey: KEY_A },
        }),
      ],
    });
    const check = checkChartstringRemoval(base({ snapshot: snapshot([]), settings: s }));
    expect(check).toMatchObject({
      removable: true,
      ruleIdsToDelete: ["r1"],
      remainderRuleIdsToRepair: ["r2"],
      removePlannedSourceId: null,
    });
    if (!check.removable) throw new Error("expected removable");
    const next = applyChartstringRemoval(s, check);
    expect(next.projectionRules?.map((r) => r.id)).toEqual(["r2", "r3"]);
    expect(next.projectionRules?.[0]?.remainder).toEqual({ kind: "uncovered" });
    expect(next.projectionRules?.[1]?.remainder).toEqual({
      kind: "moveTo",
      chartstringKey: KEY_A,
    });
  });

  it("keeps a planned source another person still references", () => {
    const s = settings({
      plannedFundingSources: [planned()],
      projectionRules: [
        rule({ chartstringKey: KEY_PLANNED }),
        rule({ id: "r2", personKey: "hr:2002", chartstringKey: KEY_PLANNED }),
      ],
    });
    const check = checkChartstringRemoval(
      base({ settings: s, chartstringKey: KEY_PLANNED })
    );
    expect(check).toMatchObject({ removable: true, removePlannedSourceId: null });
  });

  it("deletes a planned source once this removal orphans it", () => {
    const s = settings({
      plannedFundingSources: [planned()],
      projectionRules: [
        rule({ chartstringKey: KEY_PLANNED }),
        rule({
          id: "r2",
          chartstringKey: "other-key",
          remainder: { kind: "moveTo", chartstringKey: KEY_PLANNED },
        }),
      ],
    });
    const check = checkChartstringRemoval(
      base({ settings: s, chartstringKey: KEY_PLANNED })
    );
    expect(check).toMatchObject({ removable: true, removePlannedSourceId: "p1" });
    if (!check.removable) throw new Error("expected removable");
    const next = applyChartstringRemoval(s, check);
    expect(next.plannedFundingSources).toEqual([]);
  });

  it("never deletes a planned entry that shadows a payroll chartstring", () => {
    const s = settings({
      plannedFundingSources: [planned({ chartstringKey: KEY_A })],
      projectionRules: [rule()],
    });
    const check = checkChartstringRemoval(base({ snapshot: snapshot([]), settings: s }));
    expect(check).toMatchObject({ removable: true, removePlannedSourceId: null });
  });
});
