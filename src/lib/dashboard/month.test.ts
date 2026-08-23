import { describe, expect, it } from "vitest";
import {
  fiscalYearEndingYear,
  fiscalYearEndMonthYm,
  fiscalYearLabel,
  fiscalYearStartMonthYm,
  monthLabelLong,
  monthLabelShort,
  periodKeyToMonth,
  shiftMonth,
  monthsInFiscalYearToDate,
} from "@/lib/dashboard/month";

describe("shiftMonth", () => {
  it("moves backward a year", () => {
    expect(shiftMonth("2026-08", -12)).toBe("2025-08");
  });

  it("rolls forward across a year boundary", () => {
    expect(shiftMonth("2026-08", 6)).toBe("2027-02");
  });
});

describe("month labels", () => {
  it("spells the month out in full for the verdict", () => {
    expect(monthLabelLong("2026-11")).toBe("November 2026");
  });

  it("abbreviates for dense rows", () => {
    expect(monthLabelShort("2026-11")).toBe("Nov 26");
  });
});

describe("periodKeyToMonth", () => {
  it("accepts both period-end and report-run-date keys", () => {
    expect(periodKeyToMonth("2026-08")).toBe("2026-08");
    expect(periodKeyToMonth("2026-08-14")).toBe("2026-08");
  });
});

describe("fiscal year helpers", () => {
  it("numbers July-start years by the ending calendar year", () => {
    expect(fiscalYearEndingYear("2026-06", 7)).toBe(2026);
    expect(fiscalYearEndingYear("2026-07", 7)).toBe(2027);
    expect(fiscalYearEndingYear("2026-08", 7)).toBe(2027);
  });

  it("labels FY26–27 for the year ending 2027", () => {
    expect(fiscalYearLabel(2027)).toBe("FY26–27");
  });

  it("walks FYTD from July through the planning month", () => {
    expect(fiscalYearStartMonthYm("2026-08", 7)).toBe("2026-07");
    expect(fiscalYearEndMonthYm("2026-08", 7)).toBe("2027-06");
    expect(monthsInFiscalYearToDate("2026-08", 7)).toEqual(["2026-07", "2026-08"]);
  });
});
