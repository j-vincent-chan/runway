import { describe, expect, it } from "vitest";
import { fiscalYearEndMonth, resolveHorizonMonths } from "@/lib/projections/horizon";

describe("fiscalYearEndMonth", () => {
  it("spans the year boundary for a July fiscal year", () => {
    // FY26–27 runs Jul 2026 – Jun 2027.
    expect(fiscalYearEndMonth("2026-08", 7)).toBe("2027-06");
    expect(fiscalYearEndMonth("2026-05", 7)).toBe("2026-06");
  });

  it("keeps a January fiscal year inside its own calendar year", () => {
    // `m >= start` is always true when start is 1, which pushed every calendar
    // fiscal year a full year out — Aug 2026 resolved to Dec 2027.
    expect(fiscalYearEndMonth("2026-08", 1)).toBe("2026-12");
    expect(fiscalYearEndMonth("2026-01", 1)).toBe("2026-12");
    expect(fiscalYearEndMonth("2026-12", 1)).toBe("2026-12");
  });
});

describe("resolveHorizonMonths", () => {
  it("returns twelve months by default", () => {
    expect(resolveHorizonMonths("2026-08", undefined, 7)).toHaveLength(12);
  });

  it("honours an explicit custom end month", () => {
    const months = resolveHorizonMonths(
      "2026-08",
      { preset: "custom", customEndMonth: "2026-10" },
      7
    );
    expect(months).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("falls back to twelve months for a preset it does not know", () => {
    // Documents a real trap: the preset union has no "36" or "48", and there
    // is no default branch, so an unrecognized value silently yields a year.
    // Callers needing an arbitrary length must use "custom".
    const months = resolveHorizonMonths(
      "2026-08",
      { preset: "48" as unknown as "custom" },
      7
    );
    expect(months).toHaveLength(12);
  });
});
