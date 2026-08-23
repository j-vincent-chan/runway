import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AppSettings, type MonthlyCostRecord, type PayrollReportSnapshot } from "@/types";
import { buildPersonnelCostTrend } from "@/lib/dashboard/metrics";
import { buildDashboardInsights, shiftMonth } from "@/lib/dashboard/insights";

function ymRange(start: string, end: string): string[] {
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months;
}

function costRow(
  id: string,
  employeeId: string,
  month: string,
  amount: number,
  fundingSourceId?: string
): MonthlyCostRecord {
  return {
    id,
    employeeId,
    month,
    amount,
    rowType: fundingSourceId ? "baseSalary" : "totalCompBenefits",
    sourceType: "actual",
    fundingSourceId,
  };
}

function snapshot(opts: {
  employees: { id: string; name: string }[];
  months: string[];
  costs: MonthlyCostRecord[];
  fundingSources?: PayrollReportSnapshot["fundingSources"];
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
    monthlyAllocations: [],
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
  employeePersonnelTypes: {
    e1: "researchDevelopment",
    e2: "dataManagement",
    e3: "researchDevelopment",
  },
  fundingSourceCategories: {
    "4000-proj": "projects",
    "1000-start": "startup",
  },
};

const fundingSources: PayrollReportSnapshot["fundingSources"] = [
  {
    id: "fs-projects",
    rawName: "4000-proj",
    alias: "Grant",
    accountString: "4000-proj",
    color: "#b42318",
  },
  {
    id: "fs-startup",
    rawName: "1000-start",
    alias: "Startup",
    accountString: "1000-start",
    color: "#0c2340",
  },
];

describe("shiftMonth", () => {
  it("moves backward a year", () => {
    expect(shiftMonth("2026-08", -12)).toBe("2025-08");
  });
});

describe("buildPersonnelCostTrend group breakdown", () => {
  it("includes headcount and cost by personnel group", () => {
    const months = ["2026-08"];
    const costs = [
      costRow("c1", "e1", "2026-08", 8000),
      costRow("c2", "e2", "2026-08", 3000),
    ];
    const snap = snapshot({
      employees: [
        { id: "e1", name: "Ada" },
        { id: "e2", name: "Bea" },
      ],
      months,
      costs,
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
});

describe("buildDashboardInsights", () => {
  const priorYear = ymRange("2024-09", "2025-08");
  const currentYear = ymRange("2025-09", "2026-08");
  const months = [...priorYear, ...currentYear];

  function fullHistorySnap(includeThirdFrom = "2026-08") {
    const costs: MonthlyCostRecord[] = [];
    for (const month of months) {
      const inCurrent = month >= "2025-09";
      const e1Total = inCurrent ? 7800 : 7000;
      const e2Total = 3000;
      costs.push(costRow(`t-e1-${month}`, "e1", month, e1Total));
      costs.push(costRow(`t-e2-${month}`, "e2", month, e2Total));
      const e1Projects = inCurrent ? 5538 : 5460;
      const e1Startup = e1Total - e1Projects;
      const e2Projects = 2130;
      const e2Startup = e2Total - e2Projects;
      costs.push(costRow(`p-e1-${month}`, "e1", month, e1Projects, "fs-projects"));
      costs.push(costRow(`s-e1-${month}`, "e1", month, e1Startup, "fs-startup"));
      costs.push(costRow(`p-e2-${month}`, "e2", month, e2Projects, "fs-projects"));
      costs.push(costRow(`s-e2-${month}`, "e2", month, e2Startup, "fs-startup"));
      if (month >= includeThirdFrom) {
        costs.push(costRow(`t-e3-${month}`, "e3", month, 1));
      }
    }
    // Overlay mix so current month is 71% projects vs prior 78%.
    for (const month of ["2025-08", "2026-08"]) {
      const isCurrent = month === "2026-08";
      const projectShare = isCurrent ? 0.71 : 0.78;
      for (const emp of [
        { id: "e1", total: isCurrent ? 7800 : 7000 },
        { id: "e2", total: 3000 },
      ]) {
        const projects = Math.round(emp.total * projectShare);
        const startup = emp.total - projects;
        const p = costs.find((c) => c.id === `p-${emp.id}-${month}`);
        const s = costs.find((c) => c.id === `s-${emp.id}-${month}`);
        if (p) p.amount = projects;
        if (s) s.amount = startup;
      }
    }
    return snapshot({
      employees: [
        { id: "e1", name: "Ada" },
        { id: "e2", name: "Bea" },
        { id: "e3", name: "Cam" },
      ],
      months,
      costs,
      fundingSources,
    });
  }

  it("surfaces cost YoY, team size, funding mix, and runway attention", () => {
    const snap = fullHistorySnap();
    const trend = buildPersonnelCostTrend(snap, settings);
    const insights = buildDashboardInsights({
      snapshot: snap,
      fundingSources,
      settings,
      monthly: trend.monthly,
      groupBreakdown: trend.groupBreakdown,
      planningMonth: trend.planningMonth,
      runwayMonthsByEmployee: new Map([
        ["e1", 3.2],
        ["e2", 14],
        ["e3", 1.5],
      ]),
      limitingAccountByEmployee: new Map([
        ["e1", "R01 Chen"],
        ["e3", "Startup"],
      ]),
    });

    const kinds = insights.map((i) => i.kind);
    expect(kinds).toEqual(["cost_yoy", "headcount", "funding_mix", "runway_attention"]);

    const cost = insights.find((i) => i.kind === "cost_yoy")!;
    expect(cost.headline).toMatch(/Personnel costs ↑ 8% YoY/);
    expect(cost.detail).toMatch(/Research development/i);

    const headcount = insights.find((i) => i.kind === "headcount")!;
    expect(headcount.headline).toBe("Team size increased 2 → 3");

    const mix = insights.find((i) => i.kind === "funding_mix")!;
    expect(mix.headline).toBe("Projects funding decreased 78% → 71%");

    const runway = insights.find((i) => i.kind === "runway_attention")!;
    expect(runway.headline).toBe("Cam and Ada need funding");
    expect(runway.detail).toBe(
      "Cam — September 2026 (Startup) · Ada — November 2026 (R01 Chen)"
    );
    expect(runway.href).toBe("/runway");
  });

  it("names the person, the month they run short, and the limiting fund", () => {
    const months = ["2026-08"];
    const snap = snapshot({
      employees: [{ id: "e1", name: "Ada" }],
      months,
      costs: [costRow("c1", "e1", "2026-08", 9000)],
    });
    const trend = buildPersonnelCostTrend(snap, settings);
    const insights = buildDashboardInsights({
      snapshot: snap,
      fundingSources: [],
      settings,
      monthly: trend.monthly,
      groupBreakdown: trend.groupBreakdown,
      planningMonth: trend.planningMonth,
      runwayMonthsByEmployee: new Map([["e1", 2.4]]),
      limitingAccountByEmployee: new Map([["e1", "R01 Chen"]]),
    });
    const runway = insights.find((i) => i.kind === "runway_attention")!;
    expect(runway.headline).toBe("Ada needs funding by October 2026");
    expect(runway.detail).toBe("funded through October 2026 · R01 Chen");
  });

  it("uses largest cost group only when fewer than three other insights", () => {
    const months = ["2026-08"];
    const snap = snapshot({
      employees: [
        { id: "e1", name: "Ada" },
        { id: "e2", name: "Bea" },
      ],
      months,
      costs: [costRow("c1", "e1", "2026-08", 9000), costRow("c2", "e2", "2026-08", 1000)],
    });
    const trend = buildPersonnelCostTrend(snap, settings);
    const insights = buildDashboardInsights({
      snapshot: snap,
      fundingSources: [],
      settings,
      monthly: trend.monthly,
      groupBreakdown: trend.groupBreakdown,
      planningMonth: trend.planningMonth,
    });
    expect(insights.some((i) => i.kind === "largest_cost_group")).toBe(true);
    expect(insights.find((i) => i.kind === "largest_cost_group")?.headline).toMatch(
      /Research development/
    );
  });

  it("caps at five insights", () => {
    const snap = fullHistorySnap();
    const trend = buildPersonnelCostTrend(snap, settings);
    const insights = buildDashboardInsights({
      snapshot: snap,
      fundingSources,
      settings,
      monthly: trend.monthly,
      groupBreakdown: trend.groupBreakdown,
      planningMonth: trend.planningMonth,
      runwayMonthsByEmployee: new Map([
        ["e1", 2],
        ["e3", 0],
      ]),
    });
    expect(insights.length).toBeLessThanOrEqual(5);
  });
});
