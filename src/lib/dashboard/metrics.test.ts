import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type FundingSource,
  type MonthlyAllocation,
  type MonthlyCostRecord,
  type PayrollReportSnapshot,
} from "@/types";
import {
  buildFundingMixForEmployees,
  buildPersonnelCostTrend,
  flagAnomalousMonths,
  monthsForFundingMixPeriod,
  UNATTRIBUTED_MIX_KEY,
  type PersonnelCostTrendPoint,
} from "@/lib/dashboard/metrics";
import { shiftMonth } from "@/lib/dashboard/month";

function costRow(
  id: string,
  employeeId: string,
  month: string,
  amount: number,
  extras: Partial<MonthlyCostRecord> = {}
): MonthlyCostRecord {
  return {
    id,
    employeeId,
    month,
    amount,
    rowType: "totalCompBenefits",
    sourceType: "actual",
    ...extras,
  };
}

function snapshot(opts: {
  employees: { id: string; name: string }[];
  months: string[];
  costs: MonthlyCostRecord[];
  fundingSources?: FundingSource[];
  allocations?: MonthlyAllocation[];
}): PayrollReportSnapshot {
  return {
    id: "s",
    sourceFileName: "t.xlsx",
    uploadedAt: "2026-08-01T00:00:00.000Z",
    reportName: "t",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees: opts.employees.map((e) => ({ ...e, appointmentPercent: 100 })),
    fundingSources: opts.fundingSources ?? [],
    monthlyAllocations: opts.allocations ?? [],
    monthlyCosts: opts.costs,
    rawRows: [],
    monthRange: {
      start: opts.months[0] ?? "2025-01",
      end: opts.months[opts.months.length - 1] ?? "2026-08",
    },
    actualMonths: opts.months,
    futureMonths: [],
  };
}

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  employeePersonnelTypes: { e1: "researchDevelopment", e2: "dataManagement" },
};

function fundingSource(id = "f1", account = "7000-1-7030720-45"): FundingSource {
  return { id, rawName: account, alias: "Grant A", accountString: account, fund: "7000", color: "#ccc" };
}

function allocation(
  month: string,
  employeeId: string,
  fundingSourceId: string,
  pct = 100
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

function salaryAndBenefitCosts(
  month: string,
  employeeId: string,
  fundingSourceId: string,
  total = 10_000
): MonthlyCostRecord[] {
  return [
    costRow(`s-${employeeId}-${month}`, employeeId, month, total * 0.75, {
      rowType: "baseSalary",
      fundingSourceId,
    }),
    costRow(`b-${employeeId}-${month}`, employeeId, month, total * 0.25, { rowType: "benefits" }),
    costRow(`t-${employeeId}-${month}`, employeeId, month, total, { rowType: "totalCompBenefits" }),
  ];
}

function mixTotal(slices: { value: number }[]): number {
  return slices.reduce((s, x) => s + x.value, 0);
}

function ymRange(start: string, end: string): string[] {
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months;
}

describe("buildPersonnelCostTrend group breakdown", () => {
  it("includes headcount and cost by personnel group", () => {
    const snap = snapshot({
      employees: [
        { id: "e1", name: "Ada" },
        { id: "e2", name: "Bea" },
      ],
      months: ["2026-08"],
      costs: [costRow("c1", "e1", "2026-08", 8000), costRow("c2", "e2", "2026-08", 3000)],
    });

    const { groupBreakdown, planningMonth } = buildPersonnelCostTrend(snap, settings);
    expect(planningMonth).toBe("2026-08");

    const research = groupBreakdown.find((g) => g.key === "researchDevelopment");
    const data = groupBreakdown.find((g) => g.key === "dataManagement");
    expect(research?.count).toBe(1);
    expect(research?.cost).toBe(8000);
    expect(data?.count).toBe(1);
    expect(data?.cost).toBe(3000);
  });

  it("buckets yearly costs by fiscal year and projects remaining months in the current FY", () => {
    const priorFy = ymRange("2025-07", "2026-06");
    const currentFytd = ["2026-07", "2026-08"];
    const months = [...priorFy, ...currentFytd];
    const costs = months.map((month) =>
      costRow(`c-${month}`, "e1", month, month <= "2026-06" ? 1000 : 1100)
    );
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months,
      costs,
    });

    const { yearly } = buildPersonnelCostTrend(snap, settings, "2026-08");

    expect(yearly.map((y) => y.label)).toEqual(["FY25–26", "FY26–27"]);

    const prior = yearly[0]!;
    expect(prior.year).toBe(2026);
    expect(prior.actual).toBe(12_000);
    expect(prior.projected).toBe(0);
    expect(prior.total).toBe(12_000);
    expect(prior.monthsWithData).toBe(12);
    expect(prior.partial).toBe(false);

    const current = yearly[1]!;
    expect(current.year).toBe(2027);
    expect(current.actual).toBe(2200);
    expect(current.projected).toBe(11_000);
    expect(current.total).toBe(13_200);
    expect(current.monthsWithData).toBe(2);
    expect(current.partial).toBe(true);
  });

  it("does not project remaining months for an incomplete prior fiscal year", () => {
    const months = ymRange("2026-01", "2026-08");
    const costs = months.map((month, i) => costRow(`c-${i}`, "e1", month, 1000));
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months,
      costs,
    });

    const { yearly } = buildPersonnelCostTrend(snap, settings, "2026-08");
    const prior = yearly.find((y) => y.year === 2026)!;
    const current = yearly.find((y) => y.year === 2027)!;

    expect(prior.monthsWithData).toBe(6);
    expect(prior.partial).toBe(true);
    expect(prior.projected).toBe(0);
    expect(prior.total).toBe(6000);

    expect(current.actual).toBe(2000);
    expect(current.projected).toBe(10_000);
  });
});

describe("monthsForFundingMixPeriod", () => {
  it("treats ytd as fiscal-year-to-date when the FY starts in July", () => {
    const months = ymRange("2026-01", "2026-08");
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months,
      costs: months.map((month, i) => costRow(`c-${i}`, "e1", month, 1)),
    });

    expect(monthsForFundingMixPeriod("ytd", snap, "2026-08", 7)).toEqual([
      "2026-07",
      "2026-08",
    ]);
  });
});

describe("buildFundingMixForEmployees reconciles with personnel cost", () => {
  const grant: FundingSource = {
    id: "fs-grant",
    rawName: "4000-grant",
    alias: "Grant",
    accountString: "4000-grant",
    color: "#b42318",
  };
  const startup: FundingSource = {
    id: "fs-startup",
    rawName: "1000-start",
    alias: "Startup",
    accountString: "1000-start",
    color: "#0c2340",
  };
  const categorized: AppSettings = {
    ...settings,
    fundingSourceCategories: {
      "4000-grant": "projects",
      "1000-start": "startup",
    },
  };

  it("allocates benefits onto funds so the donut matches salary + benefits", () => {
    const month = "2026-08";
    const personnelTotal = 188114;
    const fundSalary = 128777;
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months: [month],
      fundingSources: [grant],
      costs: [
        costRow("t1", "e1", month, personnelTotal),
        costRow("s1", "e1", month, fundSalary, {
          rowType: "baseSalary",
          fundingSourceId: grant.id,
        }),
        costRow("b1", "e1", month, personnelTotal - fundSalary, { rowType: "benefits" }),
      ],
    });

    const cost = buildPersonnelCostTrend(snap, categorized).monthly.find((m) => m.month === month);
    const slices = buildFundingMixForEmployees(
      snap.employees,
      [month],
      snap,
      [grant],
      categorized
    );

    expect(cost?.total).toBe(personnelTotal);
    expect(mixTotal(slices)).toBeCloseTo(personnelTotal, 5);
    expect(slices.find((s) => s.key === "projects")?.value).toBeCloseTo(personnelTotal, 5);
    expect(slices.find((s) => s.key === UNATTRIBUTED_MIX_KEY)).toBeUndefined();
  });

  it("does not stack effort-only funds on top of salary+benefits", () => {
    const month = "2026-08";
    const personnelTotal = 188114;
    const fundSalary = 128777;
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months: [month],
      fundingSources: [grant, startup],
      allocations: [
        {
          id: "a-start",
          employeeId: "e1",
          fundingSourceId: startup.id,
          month,
          percentEffort: 3,
          sourceType: "actual",
          status: "imported",
        },
      ],
      costs: [
        costRow("t1", "e1", month, personnelTotal),
        costRow("s1", "e1", month, fundSalary, {
          rowType: "baseSalary",
          fundingSourceId: grant.id,
        }),
      ],
    });

    const slices = buildFundingMixForEmployees(
      snap.employees,
      [month],
      snap,
      [grant, startup],
      categorized
    );

    expect(mixTotal(slices)).toBeCloseTo(personnelTotal, 5);
    expect(slices.find((s) => s.key === "projects")?.value).toBeCloseTo(personnelTotal, 5);
    expect(slices.find((s) => s.key === "startup")).toBeUndefined();
  });

  it("splits benefits in proportion to each fund's salary", () => {
    const month = "2026-08";
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months: [month],
      fundingSources: [grant, startup],
      costs: [
        costRow("t1", "e1", month, 10000),
        costRow("s-grant", "e1", month, 6000, {
          rowType: "baseSalary",
          fundingSourceId: grant.id,
        }),
        costRow("s-start", "e1", month, 2000, {
          rowType: "baseSalary",
          fundingSourceId: startup.id,
        }),
      ],
    });

    const slices = buildFundingMixForEmployees(
      snap.employees,
      [month],
      snap,
      [grant, startup],
      categorized
    );

    expect(mixTotal(slices)).toBeCloseTo(10000, 5);
    expect(slices.find((s) => s.key === "projects")?.value).toBeCloseTo(7500, 5);
    expect(slices.find((s) => s.key === "startup")?.value).toBeCloseTo(2500, 5);
  });

  it("surfaces payroll cost with no fund as a hatched unattributed slice", () => {
    const month = "2026-08";
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months: [month],
      fundingSources: [grant],
      costs: [costRow("t1", "e1", month, 5000)],
    });

    const slices = buildFundingMixForEmployees(
      snap.employees,
      [month],
      snap,
      [grant],
      categorized
    );

    expect(mixTotal(slices)).toBeCloseTo(5000, 5);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.key).toBe(UNATTRIBUTED_MIX_KEY);
    expect(slices[0]?.name).toBe("No funding source");
  });
});

describe("buildPersonnelCostTrend projected extension", () => {
  it("extends past the last actual month without overlapping it, tagging isProjected", () => {
    const fs1 = fundingSource();
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months: ["2026-07", "2026-08"],
      costs: [
        ...salaryAndBenefitCosts("2026-07", "e1", fs1.id),
        ...salaryAndBenefitCosts("2026-08", "e1", fs1.id),
      ],
      fundingSources: [fs1],
      allocations: [
        allocation("2026-07", "e1", fs1.id),
        allocation("2026-08", "e1", fs1.id),
      ],
    });

    const { monthly, monthlyProjected } = buildPersonnelCostTrend(snap, settings, "2026-08", {
      workingPlan: null,
      portfolio: new Map(),
      horizonMonths: 3,
    });

    expect(monthly.every((m) => !m.isProjected)).toBe(true);
    expect(monthly[monthly.length - 1]!.month).toBe("2026-08");

    // horizonMonths counts today (already covered by `monthly`) as month 1,
    // so a 3-month horizon yields 2 new projected months beyond it.
    expect(monthlyProjected.every((m) => m.isProjected)).toBe(true);
    expect(monthlyProjected.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(monthlyProjected.every((m) => m.total > 0)).toBe(true);
    expect(monthlyProjected.every((m) => m.headcount === 1)).toBe(true);
  });

  it("supports a 36-month horizon, which is not a named projectionHorizon preset", () => {
    const fs1 = fundingSource();
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months: ["2026-08"],
      costs: salaryAndBenefitCosts("2026-08", "e1", fs1.id),
      fundingSources: [fs1],
      allocations: [allocation("2026-08", "e1", fs1.id)],
    });

    const { monthlyProjected } = buildPersonnelCostTrend(snap, settings, "2026-08", {
      workingPlan: null,
      portfolio: new Map(),
      horizonMonths: 36,
    });

    expect(monthlyProjected).toHaveLength(35);
    expect(monthlyProjected[0]!.month).toBe("2026-09");
    expect(monthlyProjected[34]!.month).toBe("2029-07");
  });

  it("returns an empty monthlyProjected and leaves monthly untouched when projection is omitted", () => {
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months: ["2026-08"],
      costs: [costRow("c1", "e1", "2026-08", 8000)],
    });

    const { monthly, monthlyProjected } = buildPersonnelCostTrend(snap, settings, "2026-08");

    expect(monthlyProjected).toEqual([]);
    expect(monthly).toHaveLength(1);
    expect(monthly[0]?.isProjected).toBe(false);
    expect(monthly[0]?.total).toBe(8000);
  });
});

describe("flagAnomalousMonths", () => {
  function point(month: string, total: number): PersonnelCostTrendPoint {
    return { month, label: month, total, headcount: 1, isProjected: false };
  }

  it("flags months more than the threshold away from the reference average, signed", () => {
    const monthly = [
      point("2026-01", 100),
      point("2026-02", 100),
      point("2026-03", 100),
      point("2026-04", 130),
      point("2026-05", 70),
    ];
    const flagged = flagAnomalousMonths(monthly, 100);
    expect(flagged.get("2026-04")).toBeCloseTo(0.3, 5);
    expect(flagged.get("2026-05")).toBeCloseTo(-0.3, 5);
    expect(flagged.has("2026-01")).toBe(false);
  });

  it("does not flag anything below the minimum-months guard", () => {
    const monthly = [point("2026-01", 100), point("2026-02", 500)];
    expect(flagAnomalousMonths(monthly, 100).size).toBe(0);
  });

  it("does not flag anything when the reference average is non-positive", () => {
    const monthly = [point("2026-01", 100), point("2026-02", 100), point("2026-03", 100)];
    expect(flagAnomalousMonths(monthly, 0).size).toBe(0);
  });
});
