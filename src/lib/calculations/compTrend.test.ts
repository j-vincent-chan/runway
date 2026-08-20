import { describe, expect, it } from "vitest";
import type { MonthlyCostRecord, PayrollReportSnapshot } from "@/types";
import { getEmployeeCompTrend } from "@/lib/calculations";

function cost(
  month: string,
  salary: number,
  benefits: number,
  total: number
): MonthlyCostRecord[] {
  return [
    {
      id: `s-${month}`,
      employeeId: "e1",
      month,
      rowType: "baseSalary",
      amount: salary,
      sourceType: "actual",
    },
    {
      id: `b-${month}`,
      employeeId: "e1",
      month,
      rowType: "benefits",
      amount: benefits,
      sourceType: "actual",
    },
    {
      id: `t-${month}`,
      employeeId: "e1",
      month,
      rowType: "totalCompBenefits",
      amount: total,
      sourceType: "actual",
    },
  ];
}

function snap(months: string[], costs: MonthlyCostRecord[]): PayrollReportSnapshot {
  return {
    id: "s",
    sourceFileName: "t.xlsx",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    reportName: "t",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees: [{ id: "e1", name: "Ada", appointmentPercent: 100 }],
    fundingSources: [],
    monthlyAllocations: [],
    monthlyCosts: costs,
    rawRows: [],
    monthRange: { start: months[0] ?? "2026-01", end: months[months.length - 1] ?? "2026-01" },
    actualMonths: months,
    futureMonths: [],
  };
}

describe("getEmployeeCompTrend", () => {
  it("annualizes monthly S+B and groups calendar-year averages", () => {
    const months = ["2025-11", "2025-12", "2026-01"];
    const costs = [
      ...cost("2025-11", 10000, 2000, 12000),
      ...cost("2025-12", 10000, 2000, 12000),
      ...cost("2026-01", 11000, 2200, 13200),
    ];
    const { monthly, yearly } = getEmployeeCompTrend("e1", snap(months, costs));
    expect(monthly).toHaveLength(3);
    expect(monthly[0]?.yearlyTotal).toBe(144000);
    expect(monthly[2]?.yearlySalary).toBe(132000);
    expect(yearly.map((y) => y.year)).toEqual([2025, 2026]);
    expect(yearly[0]?.avgYearlyTotal).toBe(144000);
    expect(yearly[1]?.avgYearlyTotal).toBe(158400);
  });

  it("uses cost months even when actualMonths is empty", () => {
    const costs = [...cost("2025-06", 9000, 1000, 10000), ...cost("2026-01", 9500, 1000, 10500)];
    const { monthly } = getEmployeeCompTrend("e1", snap([], costs));
    expect(monthly.map((p) => p.month)).toEqual(["2025-06", "2026-01"]);
    expect(monthly[0]?.yearlyTotal).toBe(120000);
  });
});
