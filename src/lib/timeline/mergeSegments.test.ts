import { describe, expect, it } from "vitest";
import { buildTimelineSegments } from "@/lib/timeline/mergeSegments";
import { mergeByPercent, lightenProjectionFill } from "@/lib/projections/grid";
import type { MonthlyAllocation, PayrollReportSnapshot } from "@/types";

function alloc(month: string, pct: number, status: MonthlyAllocation["status"] = "imported"): MonthlyAllocation {
  return {
    id: month,
    employeeId: "e1",
    fundingSourceId: "f1",
    month,
    percentEffort: pct,
    sourceType: "actual",
    status,
  };
}

const snapshot = {
  futureMonths: [] as string[],
} as PayrollReportSnapshot;

describe("buildTimelineSegments", () => {
  it("merges consecutive months that display as the same percent", () => {
    const byMonth: Record<string, MonthlyAllocation> = {
      "2026-02": alloc("2026-02", 55.34),
      "2026-03": alloc("2026-03", 55.28),
      "2026-04": alloc("2026-04", 55.31),
      "2026-05": alloc("2026-05", 57.1),
    };
    const months = ["2026-02", "2026-03", "2026-04", "2026-05"];
    const segments = buildTimelineSegments(months, (m) => byMonth[m], snapshot);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      colspan: 3,
      months: ["2026-02", "2026-03", "2026-04"],
      percentEffort: 55.3,
    });
    expect(segments[1]).toMatchObject({ colspan: 1, percentEffort: 57.1 });
  });

  it("does not merge across actual vs future months", () => {
    const byMonth: Record<string, MonthlyAllocation> = {
      "2026-07": alloc("2026-07", 55.3),
      "2026-08": alloc("2026-08", 55.3),
    };
    const segments = buildTimelineSegments(
      ["2026-07", "2026-08"],
      (m) => byMonth[m],
      { futureMonths: ["2026-08"] } as PayrollReportSnapshot
    );
    expect(segments).toHaveLength(2);
  });
});

describe("mergeByPercent", () => {
  it("merges consecutive months that round to the same displayed percent", () => {
    const pct: Record<string, number> = {
      "2026-02": 55.34,
      "2026-03": 55.28,
      "2026-04": 55.31,
    };
    const segments = mergeByPercent(["2026-02", "2026-03", "2026-04"], (m) => pct[m]!);
    expect(segments).toEqual([
      { months: ["2026-02", "2026-03", "2026-04"], colspan: 3, value: 55.3 },
    ]);
  });

  it("does not merge origin and projected months even when percents match", () => {
    const segments = mergeByPercent(
      ["2026-08", "2026-09", "2026-10"],
      () => 25,
      (m) => m > "2026-08"
    );
    expect(segments).toEqual([
      { months: ["2026-08"], colspan: 1, value: 25 },
      { months: ["2026-09", "2026-10"], colspan: 2, value: 25 },
    ]);
  });
});

describe("lightenProjectionFill", () => {
  it("mixes a pastel toward white", () => {
    const lighter = lightenProjectionFill("#c8daf0");
    expect(lighter.startsWith("#")).toBe(true);
    expect(lighter.toLowerCase()).not.toBe("#c8daf0");
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    expect(channel(lighter, 0)).toBeGreaterThan(channel("#c8daf0", 0));
    expect(channel(lighter, 1)).toBeGreaterThan(channel("#c8daf0", 1));
  });
});
