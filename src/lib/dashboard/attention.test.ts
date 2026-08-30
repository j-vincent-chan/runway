import { describe, expect, it } from "vitest";
import {
  ATTENTION_ROW_CAP,
  buildAttentionQueue,
  type RunwayContext,
} from "@/lib/dashboard/attention";
import { DEFAULT_SETTINGS, type AppSettings, type MonthlyCostRecord, type PayrollReportSnapshot } from "@/types";

const MONTH = "2026-08";

function snapshot(
  employees: { id: string; name: string }[],
  costs: MonthlyCostRecord[] = [],
  fundingSources: PayrollReportSnapshot["fundingSources"] = []
): PayrollReportSnapshot {
  return {
    id: "s",
    sourceFileName: "payroll.xlsx",
    uploadedAt: "2026-08-01T00:00:00.000Z",
    reportName: "t",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees: employees.map((e) => ({ ...e, appointmentPercent: 100 })),
    fundingSources,
    monthlyAllocations: [],
    monthlyCosts: costs,
    rawRows: [],
    monthRange: { start: MONTH, end: MONTH },
    actualMonths: [MONTH],
    futureMonths: [],
  };
}

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  employeePersonnelTypes: { e1: "researchDevelopment", e2: "dataManagement" },
};

function runwayContext(
  monthsByEmployee: [string, number | null][],
  accounts: RunwayContext["accounts"] = [],
  limitingAccountByEmployee: [string, { name: string; chartRoot: string }][] = [],
  accountContributors: [string, string[]][] = []
): RunwayContext {
  return {
    monthsByEmployee: new Map(monthsByEmployee),
    limitingAccountByEmployee: new Map(limitingAccountByEmployee),
    accounts,
    accountContributors: new Map(accountContributors.map(([root, ids]) => [root, new Set(ids)])),
    fundedRoots: new Map(),
    rootsByEmployee: new Map(),
  };
}

describe("buildAttentionQueue", () => {
  it("names people and accounts, and sorts critical first then by date", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([
        { id: "e1", name: "M. Chen" },
        { id: "e2", name: "R. Okafor" },
      ]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext(
        [
          ["e1", 2.4],
          ["e2", 5.1],
        ],
        [{ chartRoot: "5R01-118440", name: "5R01-118440", months: -1, balance: -8110 }],
        [["e1", { name: "R01 Chen", chartRoot: "r01-chen-root" }]]
      ),
    });

    expect(queue.rows.map((r) => r.entity)).toEqual([
      "5R01-118440",
      "M. Chen",
      "R. Okafor",
    ]);
    expect(queue.rows.map((r) => r.severity)).toEqual(["critical", "critical", "caution"]);
    expect(queue.rows[0]?.detail).toBe("overdrawn $8,110");
    expect(queue.rows[1]?.detail).toBe("funded through October 2026 · R01 Chen");
    expect(queue.rows[1]?.context).toBe("Research development");
    expect(queue.rows[1]?.actionLabel).toBe("Reassign");
    // The verb and the destination have to agree: reassignment is a
    // Projections rule, and the row deep-links to the person.
    expect(queue.rows[1]?.href).toMatch(/^\/projections\?person=/);
    expect(queue.rows[0]?.href).toMatch(/^\/runway\?account=/);
    expect(queue.rows[2]?.detail).toBe("funded through January 2027");
  });

  it("prioritizes the account, not the person, when the account is actually overdrawn", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "Xochitl Vargas" }]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext(
        [["e1", -1]],
        [{ chartRoot: "7000-142062-7032261", name: "ImmunoDiverse", months: -1, balance: -6809 }],
        [["e1", { name: "ImmunoDiverse", chartRoot: "7000-142062-7032261" }]],
        [["7000-142062-7032261", ["e1"]]]
      ),
    });

    // The fund is out of money — that's the account's row to carry, naming
    // who it affects, not a claim that Xochitl herself is overdrawn.
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0]?.entity).toBe("ImmunoDiverse");
    expect(queue.rows[0]?.detail).toBe("overdrawn $6,809 · Xochitl Vargas");
    expect(queue.totalCount).toBe(1);
  });

  it("prioritizes the person, not the account, when the account still has money", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "M. Chen" }]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext(
        [["e1", 2]],
        [{ chartRoot: "fund-a", name: "Fund A", months: 2, balance: 15_000 }],
        [["e1", { name: "Fund A", chartRoot: "fund-a" }]],
        [["fund-a", ["e1"]]]
      ),
    });

    // The account isn't overdrawn — the limiting factor is M. Chen's own
    // burn against it, so their row (which already names the account) is
    // the one that stands; the account doesn't need a second, redundant row.
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0]?.entity).toBe("M. Chen");
    expect(queue.rows[0]?.detail).toBe("funded through October 2026 · Fund A");
  });

  it("carries the person's photo on their own row", () => {
    const withPhoto: AppSettings = {
      ...settings,
      employeeProfiles: { e1: { photoUrl: "sb://employee-photos/e1.jpg" } },
    };
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "M. Chen" }]),
      fundingSources: [],
      settings: withPhoto,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext([["e1", 2]]),
    });
    expect(queue.rows[0]?.personName).toBe("M. Chen");
    expect(queue.rows[0]?.photoUrl).toBe("sb://employee-photos/e1.jpg");
  });

  it("carries the affected person's photo on a solo-overdrawn account row", () => {
    const withPhoto: AppSettings = {
      ...settings,
      employeeProfiles: { e1: { photoUrl: "sb://employee-photos/e1.jpg" } },
    };
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "Xochitl Vargas" }]),
      fundingSources: [],
      settings: withPhoto,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext(
        [["e1", -1]],
        [{ chartRoot: "immunodiverse", name: "ImmunoDiverse", months: -1, balance: -6_809 }],
        [["e1", { name: "ImmunoDiverse", chartRoot: "immunodiverse" }]],
        [["immunodiverse", ["e1"]]]
      ),
    });
    expect(queue.rows[0]?.entity).toBe("ImmunoDiverse");
    expect(queue.rows[0]?.personName).toBe("Xochitl Vargas");
    expect(queue.rows[0]?.photoUrl).toBe("sb://employee-photos/e1.jpg");
  });

  it("falls back to 'already short' when no negative account balance is resolvable", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "M. Chen" }]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      // Blended runway is negative, but no single limiting account is known
      // to be in deficit — don't claim a specific overdrawn amount.
      runway: runwayContext([["e1", -1]]),
    });
    expect(queue.rows[0]?.detail).toBe("already short");
  });

  it("keeps a shared account's own row even when one contributor also has a row", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([
        { id: "e1", name: "M. Chen" },
        { id: "e2", name: "R. Okafor" },
      ]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext(
        [["e1", 2]],
        [{ chartRoot: "shared-fund", name: "Shared Fund", months: 2, balance: 1000 }],
        [["e1", { name: "Shared Fund", chartRoot: "shared-fund" }]],
        [["shared-fund", ["e1", "e2"]]]
      ),
    });

    // Two contributors — the account can't be attributed to just one row.
    expect(queue.rows.map((r) => r.entity).sort()).toEqual(["M. Chen", "Shared Fund"]);
  });

  it("keeps a solo account row when its contributor has no row of their own", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "M. Chen" }]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext(
        // e1's blended runway (across all their accounts) isn't severe enough
        // for their own row, even though this one account is.
        [["e1", 20]],
        [{ chartRoot: "fund-a", name: "Fund A", months: 2, balance: 500 }],
        [],
        [["fund-a", ["e1"]]]
      ),
    });

    expect(queue.rows.map((r) => r.entity)).toEqual(["Fund A"]);
  });

  it("carries a severity word on every row, never color alone", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "M. Chen" }]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext([["e1", 1]]),
    });
    expect(queue.rows[0]?.severityLabel).toBe("Critical");
  });

  it("counts everyone short inside the scope window, not just queue rows", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([
        { id: "e1", name: "A" },
        { id: "e2", name: "B" },
      ]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 24,
      runway: runwayContext([
        ["e1", 2],
        ["e2", 18],
      ]),
    });
    expect(queue.peopleAtRisk.map((p) => p.name)).toEqual(["A", "B"]);
    // Only the person inside the six-month severity window is queued.
    expect(queue.rows).toHaveLength(1);
  });

  it("ignores people with no runway signal", () => {
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "A" }]),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext([["e1", null]]),
    });
    expect(queue.rows).toHaveLength(0);
    expect(queue.peopleAtRisk).toHaveLength(0);
  });

  it("caps the queue and reports the full count", () => {
    const people = Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      name: `Person ${i}`,
    }));
    const queue = buildAttentionQueue({
      snapshot: snapshot(people),
      fundingSources: [],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext(people.map((p, i) => [p.id, i * 0.5] as [string, number])),
    });
    expect(queue.rows).toHaveLength(ATTENTION_ROW_CAP);
    expect(queue.totalCount).toBe(8);
  });

  it("raises a data-quality row when a group's charges have no funding type", () => {
    const costs: MonthlyCostRecord[] = [
      {
        id: "c1",
        employeeId: "e1",
        month: MONTH,
        rowType: "baseSalary",
        amount: 10000,
        sourceType: "actual",
        fundingSourceId: "fs-unknown",
      },
    ];
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "M. Chen" }], costs, []),
      fundingSources: [
        {
          id: "fs-unknown",
          rawName: "7000-129074-7030722",
          alias: "Sandbox",
          accountString: "7000-129074-7030722",
          color: "#0c2340",
        },
      ],
      settings,
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext([]),
    });

    const dataRow = queue.rows.find((r) => r.severity === "data");
    expect(dataRow?.entity).toBe("Research development");
    expect(dataRow?.detail).toBe("100% of charges have no funding type");
    expect(dataRow?.actionLabel).toBe("Categorize");
    expect(dataRow?.href).toBe("/settings?panel=accounts&team=researchDevelopment");
  });

  it("stays quiet when every fund is categorized", () => {
    const costs: MonthlyCostRecord[] = [
      {
        id: "c1",
        employeeId: "e1",
        month: MONTH,
        rowType: "baseSalary",
        amount: 10000,
        sourceType: "actual",
        fundingSourceId: "fs-known",
      },
    ];
    const queue = buildAttentionQueue({
      snapshot: snapshot([{ id: "e1", name: "M. Chen" }], costs, []),
      fundingSources: [
        {
          id: "fs-known",
          rawName: "7000-129074-7030722",
          alias: "Sandbox",
          accountString: "7000-129074-7030722",
          color: "#0c2340",
        },
      ],
      settings: {
        ...settings,
        fundingSourceCategories: { "7000-129074-7030722": "projects" },
      },
      planningMonth: MONTH,
      horizonMonths: 12,
      runway: runwayContext([]),
    });
    expect(queue.rows.filter((r) => r.severity === "data")).toHaveLength(0);
  });
});
