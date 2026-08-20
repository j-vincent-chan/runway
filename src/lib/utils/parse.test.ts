import { describe, expect, it } from "vitest";
import {
  formatIsoDateDisplay,
  formatPercent,
  hasPercentEffort,
  parsePercent,
  parsePercentCell,
  roundPercentDisplay,
} from "@/lib/utils/parse";

describe("parsePercent", () => {
  it("reads Excel fraction cells, including reversals and over-100% effort", () => {
    expect(parsePercent(0.25)).toBe(25);
    expect(parsePercent(-0.25)).toBe(-25);
    expect(parsePercent(1)).toBe(100);
    expect(parsePercent(-1)).toBe(-100);
    expect(parsePercent(1.5)).toBe(150);
    expect(parsePercent(-1.25)).toBe(-125);
  });

  it("reads already-scaled percent points, including reversals", () => {
    expect(parsePercent(25)).toBe(25);
    expect(parsePercent(-25)).toBe(-25);
    expect(parsePercent(125)).toBe(125);
    expect(parsePercent(55.3)).toBe(55.3);
    expect(parsePercent(5)).toBe(5);
  });

  it("reads string percents and accounting-style negatives", () => {
    expect(parsePercent("25%")).toBe(25);
    expect(parsePercent("-25%")).toBe(-25);
    expect(parsePercent("150%")).toBe(150);
    expect(parsePercent("-125%")).toBe(-125);
    expect(parsePercent("(25%)")).toBe(-25);
    expect(parsePercent("(0.25)")).toBe(-25);
    expect(parsePercent("-0.25")).toBe(-25);
  });
});

describe("parsePercentCell", () => {
  it("uses Excel percent format so 1.5 becomes 150%", () => {
    expect(parsePercentCell({ v: 1.5, z: "0.00%", w: "150.00%" })).toBe(150);
    expect(parsePercentCell({ v: -1.25, z: "0.00%", w: "-125.00%" })).toBe(-125);
    expect(parsePercentCell({ v: 0.25, z: "0%", w: "25%" })).toBe(25);
  });

  it("falls back to numeric scaling when format is missing", () => {
    expect(parsePercentCell({ v: 1.5 })).toBe(150);
    expect(parsePercentCell(undefined, 1.5)).toBe(150);
  });
});

describe("hasPercentEffort", () => {
  it("treats reversals as real effort and near-zero as empty", () => {
    expect(hasPercentEffort(-25)).toBe(true);
    expect(hasPercentEffort(25)).toBe(true);
    expect(hasPercentEffort(0)).toBe(false);
    expect(hasPercentEffort(0.001)).toBe(false);
  });
});

describe("formatIsoDateDisplay", () => {
  it("formats MyPortfolio report run dates", () => {
    expect(formatIsoDateDisplay("2026-07-31")).toBe("Jul 31, 2026");
    expect(formatIsoDateDisplay("2026-01-02")).toBe("Jan 2, 2026");
  });

  it("returns null when missing", () => {
    expect(formatIsoDateDisplay(undefined)).toBeNull();
    expect(formatIsoDateDisplay("")).toBeNull();
  });
});

describe("roundPercentDisplay / formatPercent", () => {
  it("rounds payroll-noise values to the same one-decimal bar label", () => {
    expect(roundPercentDisplay(55.34)).toBe(55.3);
    expect(roundPercentDisplay(55.28)).toBe(55.3);
    expect(roundPercentDisplay(55.31)).toBe(55.3);
    expect(formatPercent(55.34)).toBe("55.3%");
    expect(formatPercent(55.28)).toBe("55.3%");
    expect(formatPercent(5)).toBe("5%");
  });
});
