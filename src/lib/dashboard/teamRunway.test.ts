import { describe, expect, it } from "vitest";
import { ALL_TEAMS_KEY, buildTeamRunway } from "@/lib/dashboard/teamRunway";
import type { FundedRoot, RunwayContext } from "@/lib/dashboard/attention";
import { DEFAULT_SETTINGS, type AppSettings, type PayrollReportSnapshot } from "@/types";

const MONTH = "2026-08";

function snapshot(employees: { id: string; name: string }[]): PayrollReportSnapshot {
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
    fundingSources: [],
    monthlyAllocations: [],
    monthlyCosts: [],
    rawRows: [],
    monthRange: { start: MONTH, end: MONTH },
    actualMonths: [MONTH],
    futureMonths: [],
  };
}

function root(
  chartRoot: string,
  balance: number,
  sharedMonthlyBurn: number,
  balanceSource: FundedRoot["balanceSource"] = "report"
): FundedRoot {
  return { chartRoot, name: chartRoot, balance, sharedMonthlyBurn, balanceSource };
}

function context({
  monthsByEmployee = [],
  fundedRoots = [],
  rootsByEmployee = [],
}: {
  monthsByEmployee?: [string, number | null][];
  fundedRoots?: FundedRoot[];
  rootsByEmployee?: [string, string[]][];
}): RunwayContext {
  return {
    monthsByEmployee: new Map(monthsByEmployee),
    limitingAccountByEmployee: new Map(),
    accounts: [],
    accountContributors: new Map(),
    fundedRoots: new Map(fundedRoots.map((r) => [r.chartRoot, r])),
    rootsByEmployee: new Map(rootsByEmployee.map(([id, roots]) => [id, new Set(roots)])),
  };
}

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  employeePersonnelTypes: { e1: "researchDevelopment", e2: "dataManagement" },
};

function build(runway: RunwayContext, employees: { id: string; name: string }[], s = settings) {
  return buildTeamRunway({
    runway,
    snapshot: snapshot(employees),
    settings: s,
    planningMonth: MONTH,
  });
}

describe("buildTeamRunway", () => {
  it("divides each team's own funds by the burn on those accounts", () => {
    const rows = build(
      context({
        fundedRoots: [root("a", 600_000, 50_000), root("b", 120_000, 20_000)],
        rootsByEmployee: [
          ["e1", ["a"]],
          ["e2", ["b"]],
        ],
      }),
      [
        { id: "e1", name: "M. Chen" },
        { id: "e2", name: "R. Okafor" },
      ]
    );

    const research = rows.find((r) => r.label === "Research development")!;
    const data = rows.find((r) => r.label === "Data management")!;
    expect(research.funds).toBe(600_000);
    expect(research.months).toBe(12);
    expect(data.funds).toBe(120_000);
    expect(data.months).toBe(6);
  });

  it("counts a shared account once per team rather than once per member", () => {
    const settingsBothResearch: AppSettings = {
      ...DEFAULT_SETTINGS,
      employeePersonnelTypes: { e1: "researchDevelopment", e2: "researchDevelopment" },
    };
    const rows = build(
      context({
        fundedRoots: [root("a", 600_000, 50_000)],
        rootsByEmployee: [
          ["e1", ["a"]],
          ["e2", ["a"]],
        ],
      }),
      [
        { id: "e1", name: "M. Chen" },
        { id: "e2", name: "R. Okafor" },
      ],
      settingsBothResearch
    );

    const research = rows.find((r) => r.label === "Research development")!;
    expect(research.memberCount).toBe(2);
    expect(research.funds).toBe(600_000);
    expect(research.months).toBe(12);
  });

  it("counts a cross-team shared account in full for both teams", () => {
    const rows = build(
      context({
        fundedRoots: [root("a", 600_000, 50_000)],
        rootsByEmployee: [
          ["e1", ["a"]],
          ["e2", ["a"]],
        ],
      }),
      [
        { id: "e1", name: "M. Chen" },
        { id: "e2", name: "R. Okafor" },
      ]
    );

    // Each team's denominator carries the whole account's burn, including the
    // other team's charges — apportioning it would mean inventing a split rule.
    expect(rows.find((r) => r.label === "Research development")!.months).toBe(12);
    expect(rows.find((r) => r.label === "Data management")!.months).toBe(12);
    // The roll-up still counts the account exactly once.
    expect(rows.find((r) => r.key === ALL_TEAMS_KEY)!.funds).toBe(600_000);
  });

  it("returns a null runway for a team whose accounts have no burn", () => {
    const rows = build(
      context({
        fundedRoots: [root("a", 600_000, 0)],
        rootsByEmployee: [["e1", ["a"]]],
      }),
      [{ id: "e1", name: "M. Chen" }]
    );
    const research = rows.find((r) => r.label === "Research development")!;
    expect(research.months).toBeNull();
    expect(research.targetMonth).toBeNull();
  });

  it("names the member who runs short first instead of counting them", () => {
    const settingsBothResearch: AppSettings = {
      ...DEFAULT_SETTINGS,
      employeePersonnelTypes: { e1: "researchDevelopment", e2: "researchDevelopment" },
    };
    const rows = build(
      context({
        monthsByEmployee: [
          ["e1", 5],
          ["e2", 2],
        ],
        fundedRoots: [root("a", 600_000, 50_000)],
        rootsByEmployee: [
          ["e1", ["a"]],
          ["e2", ["a"]],
        ],
      }),
      [
        { id: "e1", name: "M. Chen" },
        { id: "e2", name: "R. Okafor" },
      ],
      settingsBothResearch
    );

    const research = rows.find((r) => r.label === "Research development")!;
    expect(research.firstShort?.name).toBe("R. Okafor");
    expect(research.firstShort?.month).toBe("2026-10");
  });

  it("leaves firstShort null when everyone is past the caution window", () => {
    const rows = build(
      context({
        monthsByEmployee: [["e1", 18]],
        fundedRoots: [root("a", 600_000, 50_000)],
        rootsByEmployee: [["e1", ["a"]]],
      }),
      [{ id: "e1", name: "M. Chen" }]
    );
    expect(rows.find((r) => r.label === "Research development")!.firstShort).toBeNull();
  });

  it("flags a team leaning on an assumed-OK fund's estimate", () => {
    const rows = build(
      context({
        fundedRoots: [root("a", 120_000, 20_000, "estimated")],
        rootsByEmployee: [["e1", ["a"]]],
      }),
      [{ id: "e1", name: "M. Chen" }]
    );
    expect(rows.find((r) => r.label === "Research development")!.hasEstimatedFunds).toBe(true);
  });

  it("buckets people with no team under Unassigned, listed after the named teams", () => {
    const rows = build(
      context({
        fundedRoots: [root("a", 600_000, 50_000), root("b", 100_000, 10_000)],
        rootsByEmployee: [
          ["e1", ["a"]],
          ["e9", ["b"]],
        ],
      }),
      [
        { id: "e1", name: "M. Chen" },
        { id: "e9", name: "P. Nadir" },
      ]
    );
    const labels = rows.map((r) => r.label);
    expect(labels).toEqual(["Research development", "Unassigned", "All teams"]);
  });

  it("orders teams by burn descending and ends with the roll-up", () => {
    const rows = build(
      context({
        fundedRoots: [root("a", 600_000, 10_000), root("b", 120_000, 90_000)],
        rootsByEmployee: [
          ["e1", ["a"]],
          ["e2", ["b"]],
        ],
      }),
      [
        { id: "e1", name: "M. Chen" },
        { id: "e2", name: "R. Okafor" },
      ]
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Data management",
      "Research development",
      "All teams",
    ]);
    const all = rows.at(-1)!;
    expect(all.key).toBe(ALL_TEAMS_KEY);
    expect(all.funds).toBe(720_000);
    expect(all.monthlyBurn).toBe(100_000);
  });

  it("returns only the roll-up when nobody is on the planning roster", () => {
    const rows = build(context({}), []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe(ALL_TEAMS_KEY);
    expect(rows[0]!.months).toBeNull();
  });
});
