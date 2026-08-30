import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type FundingSource } from "@/types";
import { projectionSourceLabel } from "@/lib/projections/sources";

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
