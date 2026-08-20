import { describe, expect, it } from "vitest";
import { consolidateAllocations } from "@/lib/import/consolidateAllocations";
import type { MonthlyAllocation } from "@/types";

function alloc(pct: number, source = "a", month = "2025-11"): MonthlyAllocation {
  return {
    id: `${source}-${month}-${pct}`,
    employeeId: "e1",
    fundingSourceId: source,
    month,
    percentEffort: pct,
    sourceType: "actual",
    status: "imported",
  };
}

describe("consolidateAllocations", () => {
  it("keeps payroll reversals instead of dropping negative effort", () => {
    const out = consolidateAllocations([alloc(100, "home"), alloc(-25, "wrong")]);
    expect(out).toHaveLength(2);
    expect(out.find((a) => a.fundingSourceId === "wrong")?.percentEffort).toBe(-25);
  });

  it("nets same-account same-month rows and drops a true zero", () => {
    const out = consolidateAllocations([alloc(25, "a"), alloc(-25, "a")]);
    expect(out).toHaveLength(0);
  });
});
