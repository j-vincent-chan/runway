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
import {
  depletionMonthByRoot,
  depletionMonthIndexForRoot,
  depletionRootOf,
} from "@/lib/projections/depletion";

const ACCOUNT = "7000-1-7030720-45";
const ROOT = "7000-1-7030720";
const now = new Date(2026, 7, 15); // Aug 2026

function emp(): Employee {
  return { id: "e1", name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001" };
}

function fs(): FundingSource {
  return {
    id: "f1",
    rawName: ACCOUNT,
    alias: "Grant A",
    accountString: ACCOUNT,
    fund: "7000",
    color: "#ccc",
  };
}

function alloc(month: string, pct: number): MonthlyAllocation {
  return {
    id: `e1|f1|${month}`,
    employeeId: "e1",
    fundingSourceId: "f1",
    month,
    percentEffort: pct,
    sourceType: month >= "2026-08" ? "future" : "actual",
    status: "imported",
  };
}

/** $10k/month of total comp at 100% effort, so effort maps to burn linearly. */
function costs(month: string, amount = 10_000): MonthlyCostRecord[] {
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

function snapshot(months: string[], pct: number): PayrollReportSnapshot {
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
    monthlyAllocations: months.map((m) => alloc(m, pct)),
    monthlyCosts: months.flatMap((m) => costs(m)),
    rawRows: [],
    monthRange: { start: months[0]!, end: months[months.length - 1]! },
    actualMonths: months.filter((m) => m < "2026-08"),
    futureMonths: months.filter((m) => m >= "2026-08"),
  };
}

/**
 * One imported payroll — 100% effort, $10k/mo charged to the account — with an
 * optional forward change to the distribution, which is how a PI actually
 * reduces effort on this page. The simulation anchors burn on the dollars the
 * payroll actually charged and scales by the new effort against the imported
 * one, so the rule is what makes burn differ, not a different import.
 */
function project(balance: number, newEffort?: number) {
  const rules: ProjectionRule[] =
    newEffort === undefined
      ? []
      : [
          {
            id: "r1",
            personKey: "hr:1001",
            chartstringKey: ACCOUNT,
            trigger: { type: "setEffort", fromMonth: "2026-09", percentEffort: newEffort },
            remainder: { kind: "uncovered" },
            applyOverPayroll: true,
          },
        ];
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    projectionHorizon: { preset: "24" },
    projectionRules: rules,
  };
  return simulateProjections({
    snapshot: snapshot(["2026-06", "2026-07", "2026-08"], 100),
    workingPlan: null,
    settings,
    balances: new Map([
      [
        ROOT,
        {
          chartstring: ROOT,
          balance,
          reportRunDate: "2026-08-01",
          sourceFileName: "np.xlsx",
        },
      ],
    ]),
    now,
  });
}

describe("depletionRootOf", () => {
  it("reduces a chartstring to the fund-dept-project a balance lives at", () => {
    expect(depletionRootOf(ACCOUNT)).toBe(ROOT);
  });
});

describe("depletionMonthIndexForRoot", () => {
  it("moves the runs-dry month out when the distribution is cut", () => {
    // $60k at $10k/mo empties in six months. Halving effort from September
    // halves the burn from then on, so the same balance lasts longer — the
    // whole reason for putting this date on the page where effort is edited.
    const asImported = depletionMonthIndexForRoot(project(60_000), ROOT);
    const cutToHalf = depletionMonthIndexForRoot(project(60_000, 50), ROOT);

    expect(asImported).not.toBeNull();
    expect(cutToHalf).not.toBeNull();
    expect(cutToHalf!).toBeGreaterThan(asImported!);
  });

  it("reports null when the account holds through the whole window", () => {
    expect(depletionMonthIndexForRoot(project(100_000_000), ROOT)).toBeNull();
  });

  it("reports an already-empty account at the opening month", () => {
    expect(depletionMonthIndexForRoot(project(0), ROOT)).toBe(0);
  });

  it("treats an account absent from the projection as never depleting", () => {
    // Absence is not depletion: a root the projection never tracked must not
    // read as empty in month zero.
    expect(depletionMonthIndexForRoot(project(60_000), "9999-9-9999999")).toBeNull();
  });
});

describe("depletionMonthByRoot", () => {
  it("covers every account the projection tracks", () => {
    const map = depletionMonthByRoot(project(60_000));
    expect(map.has(ROOT)).toBe(true);
    expect(map.get(ROOT)).toBe(depletionMonthIndexForRoot(project(60_000), ROOT));
  });
});

describe("an account marked not-my-account", () => {
  const NOT_MINE = "notMyAccounts";

  function runWith(patch: Partial<AppSettings>) {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      projectionHorizon: { preset: "24" },
      ...patch,
    };
    return simulateProjections({
      snapshot: snapshot(["2026-06", "2026-07", "2026-08"], 100),
      workingPlan: null,
      settings,
      // 50 months of runway at $10k/mo if the real balance were used.
      balances: new Map([
        [
          ROOT,
          {
            chartstring: ROOT,
            balance: 500_000,
            reportRunDate: "2026-08-01",
            sourceFileName: "np.xlsx",
          },
        ],
      ]),
      now,
    });
  }

  it("opens at the estimate its end date implies, not the balance on file", () => {
    const marked = runWith({
      accountGroupByBalanceKey: { [ROOT]: NOT_MINE },
      runwayAssumedEndDates: { [ROOT]: "2026-11-30" },
    });
    const opening = marked.states[0]!.remainingByRoot[ROOT]!;

    expect(opening).toBeLessThan(100_000);
    // Draws down to zero at the end date rather than running for 50 months.
    expect(depletionMonthIndexForRoot(marked, ROOT)).not.toBeNull();
    expect(depletionMonthIndexForRoot(marked, ROOT)!).toBeLessThan(6);
  });

  it("still ignores the balance on file when no end date is stored", () => {
    // The reported bug: marked, but the stored date was missing, so the
    // simulation bailed out of the override and used the real $500,000.
    const marked = runWith({ accountGroupByBalanceKey: { [ROOT]: NOT_MINE } });
    const opening = marked.states[0]!.remainingByRoot[ROOT]!;

    expect(opening).toBeLessThan(200_000);
    expect(depletionMonthIndexForRoot(marked, ROOT)).not.toBeNull();
  });

  it("uses the balance on file when the account is not marked", () => {
    const plain = runWith({});
    expect(plain.states[0]!.remainingByRoot[ROOT]!).toBeGreaterThan(400_000);
    expect(depletionMonthIndexForRoot(plain, ROOT)).toBeNull();
  });
});

/**
 * A shared, deficit account that one person is on for a fixed stretch — the
 * shape a residual account takes. The mark exists precisely so the deficit on
 * file stops being the number that decides anything.
 */
describe("a deficit account marked not-my-account", () => {
  const GOLDEN = "2000969-1-2000969-45";
  const GOLDEN_ROOT = "2000969-1-2000969";
  const OTHER = "7000-1-7030720-45";
  const OTHER_ROOT = "7000-1-7030720";
  /** Her 25% slice is $3,917/mo, so full monthly comp is four times that. */
  const FULL_COMP = 15_668;
  const HER_BURN = 3_917;
  const NOT_MINE = "notMyAccounts";

  function sharedCosts(month: string): MonthlyCostRecord[] {
    return [
      { id: `g-${month}`, employeeId: "e1", fundingSourceId: "f1", month, rowType: "baseSalary", amount: FULL_COMP * 0.25 * 0.75, sourceType: "actual" },
      { id: `o-${month}`, employeeId: "e1", fundingSourceId: "f2", month, rowType: "baseSalary", amount: FULL_COMP * 0.75 * 0.75, sourceType: "actual" },
      { id: `b-${month}`, employeeId: "e1", month, rowType: "benefits", amount: FULL_COMP * 0.25, sourceType: "actual" },
      { id: `t-${month}`, employeeId: "e1", month, rowType: "totalCompBenefits", amount: FULL_COMP, sourceType: "actual" },
    ];
  }

  function run(patch: Partial<AppSettings>) {
    const months = ["2026-06", "2026-07", "2026-08"];
    const mk = (fsId: string, pct: number, m: string): MonthlyAllocation => ({
      id: `e1|${fsId}|${m}`, employeeId: "e1", fundingSourceId: fsId, month: m,
      percentEffort: pct, sourceType: m >= "2026-08" ? "future" : "actual", status: "imported",
    });
    const snap: PayrollReportSnapshot = {
      id: "snap", sourceFileName: "t.xlsx", uploadedAt: "2026-07-01T00:00:00.000Z", reportName: "t",
      sheetName: "S", parserVersion: "1", parseStatus: "success", parseWarnings: [],
      employees: [{ id: "e1", name: "Ohnmar", appointmentPercent: 100, employeeId: "1001" } as Employee],
      fundingSources: [
        { id: "f1", rawName: GOLDEN, alias: "Golden Residual", accountString: GOLDEN, fund: "2000969", color: "#ccc" } as FundingSource,
        { id: "f2", rawName: OTHER, alias: "Other", accountString: OTHER, fund: "7000", color: "#ddd" } as FundingSource,
      ],
      monthlyAllocations: months.flatMap((m) => [mk("f1", 25, m), mk("f2", 75, m)]),
      monthlyCosts: months.flatMap((m) => sharedCosts(m)),
      rawRows: [], monthRange: { start: months[0]!, end: months[2]! },
      actualMonths: months.filter((m) => m < "2026-08"), futureMonths: months.filter((m) => m >= "2026-08"),
    };
    return simulateProjections({
      snapshot: snap,
      workingPlan: null,
      settings: { ...DEFAULT_SETTINGS, projectionHorizon: { preset: "12" }, ...patch },
      balances: new Map([
        [GOLDEN_ROOT, { chartstring: GOLDEN_ROOT, balance: -48_000, reportRunDate: "2026-08-01", sourceFileName: "np.xlsx" }],
        [OTHER_ROOT, { chartstring: OTHER_ROOT, balance: 900_000, reportRunDate: "2026-08-01", sourceFileName: "np.xlsx" }],
      ]),
      now,
    });
  }

  it("funds it at her own burn to the end date, ignoring the deficit on file", () => {
    const marked = run({
      accountGroupByBalanceKey: { [GOLDEN_ROOT]: NOT_MINE },
      runwayAssumedEndDates: { [GOLDEN_ROOT]: "2026-10-31" },
    });

    // Her 25% slice, the burn the grid draws and the estimate funds.
    const herBurn = marked.states[0]!.allocations.find(
      (a) => a.chartstringKey.includes("2000969")
    )!.monthlyBurn;
    expect(herBurn).toBeCloseTo(HER_BURN, 0);

    // Opens at burn x months-to-end-date, not at -$48,000 floored to zero.
    const opening = marked.states[0]!.remainingByRoot[GOLDEN_ROOT]!;
    expect(opening).toBeGreaterThan(0);

    // And empties on the end date — October — not in the opening month.
    const dry = depletionMonthIndexForRoot(marked, GOLDEN_ROOT);
    expect(marked.months[dry!]).toBe("2026-10");
  });

  it("reads dry immediately when it is not marked, since the deficit floors to zero", () => {
    // The contrast that explains the symptom: without the mark there is no
    // estimate, the deficit floors to $0, and the account is dry on day one
    // however long someone is still charged to it.
    const unmarked = run({});
    expect(unmarked.states[0]!.remainingByRoot[GOLDEN_ROOT]).toBe(0);
    expect(depletionMonthIndexForRoot(unmarked, GOLDEN_ROOT)).toBe(0);
  });
});
