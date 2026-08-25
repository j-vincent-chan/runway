import { describe, expect, it } from "vitest";
import {
  backfillAssumedEndDates,
  defaultAssumedEndDate,
  estimateBalanceFromAssumedEnd,
  monthsUntilAssumedEnd,
} from "@/lib/runway/assumedEndDate";

describe("defaultAssumedEndDate", () => {
  it("lands on the last day of the fiscal year end month, not the first", () => {
    // A July–June fiscal year seen from Aug 2026 ends 30 June 2027. Anchoring
    // to the 1st would cut the final month out of the estimate.
    expect(defaultAssumedEndDate(7, "2026-08")).toBe("2027-06-30");
  });

  it("stays inside the current fiscal year before it rolls over", () => {
    // Same fiscal year, but seen from May 2026 — June 2026 is still ahead.
    expect(defaultAssumedEndDate(7, "2026-05")).toBe("2026-06-30");
  });

  it("handles a calendar fiscal year", () => {
    expect(defaultAssumedEndDate(1, "2026-08")).toBe("2026-12-31");
  });

  it("produces a date the estimate can actually use", () => {
    const end = defaultAssumedEndDate(7, "2026-08");
    const months = monthsUntilAssumedEnd("2026-08", end);
    expect(months).not.toBeNull();
    expect(months!).toBeGreaterThan(9);
    expect(estimateBalanceFromAssumedEnd(months!, 1000)).toBeGreaterThan(9000);
  });
});

describe("backfillAssumedEndDates", () => {
  const ACCOUNT = "4301-142062-136092l";

  it("fills a date for an account marked without one", () => {
    const out = backfillAssumedEndDates([ACCOUNT], {}, 7, "2026-08");
    expect(out[ACCOUNT]).toBe("2027-06-30");
  });

  it("leaves a date the user already chose alone", () => {
    const out = backfillAssumedEndDates([ACCOUNT], { [ACCOUNT]: "2026-09-30" }, 7, "2026-08");
    expect(out[ACCOUNT]).toBe("2026-09-30");
  });

  it("normalizes the account key before looking it up", () => {
    // Callers pass chartstrings in whatever casing the report used.
    const out = backfillAssumedEndDates(
      ["4301-142062-136092L"],
      { [ACCOUNT]: "2026-09-30" },
      7,
      "2026-08"
    );
    expect(Object.keys(out)).toEqual([ACCOUNT]);
  });

  it("returns the same object when nothing is missing, so no pointless write", () => {
    const existing = { [ACCOUNT]: "2026-09-30" };
    expect(backfillAssumedEndDates([ACCOUNT], existing, 7, "2026-08")).toBe(existing);
  });

  it("ignores dates for accounts that are no longer marked", () => {
    const out = backfillAssumedEndDates([], { "7000-1-2": "2026-09-30" }, 7, "2026-08");
    expect(out).toEqual({ "7000-1-2": "2026-09-30" });
  });
});
