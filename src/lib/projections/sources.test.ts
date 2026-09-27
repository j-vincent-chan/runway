import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AppSettings, type Employee, type FundingSource } from "@/types";
import {
  chartstringKeysForPerson,
  keptChartstringKey,
  projectionSourceLabel,
} from "@/lib/projections/sources";
import type { ProjectionResult } from "@/lib/projections/simulate";

function source(partial: Partial<FundingSource> = {}): FundingSource {
  return {
    id: "f1",
    rawName: "7000-1-7030720-45",
    alias: "Fund 7000",
    accountString: "7000-1-7030720-45",
    fund: "7000",
    projectId: "7030720",
    color: "#ccc",
    ...partial,
  };
}

describe("projectionSourceLabel", () => {
  it("uses saved alias and project number instead of Fund #", () => {
    const label = projectionSourceLabel(source(), {
      ...DEFAULT_SETTINGS,
      fundingSourceAliases: {
        "7000-1-7030720-45": { alias: "Chan lab startup" },
      },
    });
    expect(label).toBe("Chan lab startup · 7030720");
  });

  it("falls back to the report project title and project number", () => {
    const label = projectionSourceLabel(
      source(),
      DEFAULT_SETTINGS,
      new Map([["7000-1-7030720-45", "AHRQ R18"]])
    );
    expect(label).toBe("AHRQ R18 · 7030720");
  });
});

function emp(): Employee {
  return { id: "e1", name: "Ada Lovelace", appointmentPercent: 100 };
}

const PERSON_KEY = "name:ada lovelace";

function resultWithAllocations(chartstringKeys: string[]): ProjectionResult {
  return {
    originMonth: "2026-09",
    months: ["2026-09"],
    states: [
      {
        month: "2026-09",
        allocations: chartstringKeys.map((chartstringKey, i) => ({
          employeeId: "e1",
          personKey: PERSON_KEY,
          chartstringKey,
          fundingSourceId: `f${i}`,
          percentEffort: 50,
          monthlyBurn: 1000,
        })),
        remainingByRoot: {},
        coverageByEmployee: {},
        firedRuleIds: [],
      },
    ],
    conflicts: [],
    staleness: { originMonth: "2026-09", lastPayrollMonth: null, payrollStale: false, balancesStale: false },
    sources: [],
    plannedEntities: [],
    rules: [],
  };
}

describe("chartstringKeysForPerson", () => {
  it("includes accounts from allocations and from rules", () => {
    const result = resultWithAllocations(["acct-1"]);
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      projectionRules: [
        {
          id: "r1",
          personKey: PERSON_KEY,
          chartstringKey: "acct-2",
          trigger: { type: "onDate", month: "2026-12" },
          remainder: { kind: "uncovered" },
        },
      ],
    };
    const keys = chartstringKeysForPerson(result, settings, emp(), PERSON_KEY);
    expect([...keys].sort()).toEqual(["acct-1", "acct-2"]);
  });

  it("includes a kept account with no allocation or rule", () => {
    const result = resultWithAllocations([]);
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      keptProjectionChartstrings: [keptChartstringKey(PERSON_KEY, "acct-3")],
    };
    const keys = chartstringKeysForPerson(result, settings, emp(), PERSON_KEY);
    expect([...keys]).toEqual(["acct-3"]);
  });

  it("keeps an account visible alongside a live allocation for the same account", () => {
    const result = resultWithAllocations(["acct-1"]);
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      keptProjectionChartstrings: [keptChartstringKey(PERSON_KEY, "acct-1")],
    };
    const keys = chartstringKeysForPerson(result, settings, emp(), PERSON_KEY);
    expect([...keys]).toEqual(["acct-1"]);
  });

  it("scopes kept accounts to the right person", () => {
    const result = resultWithAllocations([]);
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      keptProjectionChartstrings: [keptChartstringKey("name:someone-else", "acct-4")],
    };
    const keys = chartstringKeysForPerson(result, settings, emp(), PERSON_KEY);
    expect(keys.size).toBe(0);
  });
});
