import { describe, expect, it } from "vitest";
import { calculateMonthlyCost } from "@/lib/calculations";
import { simulateProjections } from "@/lib/projections/simulate";
import { closedFullMonths, isMonthClosedByRunDate, latestClosedFullMonth } from "@/lib/reconciliation/closure";
import { appendEvents } from "@/lib/reconciliation/events";
import { rateAtLinkEvent, rateSwitchEventsForImport, resolveForecastRate } from "@/lib/reconciliation/forecastRate";
import { applyLink } from "@/lib/reconciliation/mutations";
import {
  ACTUAL_MONTHS,
  alloc,
  ana,
  balances,
  costs,
  currentSnapshot,
  FUTURE_MONTHS,
  plan,
  settingsWith,
} from "@/lib/reconciliation/fixtures";

/** The Sep 2026 report, run Oct 1: August and September posted for Ana, both closed. */
function septemberReport(reportDate = "2026-10-01T12:00:00.000Z") {
  const actual = [...ACTUAL_MONTHS, "2026-09"];
  return currentSnapshot({
    sourceFileName: "payroll-sep.xlsx",
    allocations: [
      ...actual.map((m) => alloc("e1", "f1", m, 100, "actual")),
      ...FUTURE_MONTHS.filter((m) => m > "2026-09").map((m) => alloc("e1", "f1", m, 100, "future")),
      alloc("e2", "f1", "2026-08", 100, "actual"),
      alloc("e2", "f1", "2026-09", 100, "actual"),
      ...FUTURE_MONTHS.filter((m) => m > "2026-09").map((m) => alloc("e2", "f1", m, 100, "future")),
    ],
    costs: [
      ...actual.flatMap((m) => costs("e1", m, 10000)),
      ...costs("e2", "2026-08", 4290),
      ...costs("e2", "2026-09", 8580),
    ],
    actualMonths: actual,
    futureMonths: FUTURE_MONTHS.filter((m) => m > "2026-09"),
    reportDate,
  });
}

function link(choice: Partial<{ forecastRate: "planned" | "fyRate" | "payrollActual"; pinPlannedRate: boolean }> = {}) {
  const linked = applyLink(settingsWith(), {
    plannedHireId: "p1",
    employeePersonKey: "hr:02987654",
    employeeName: "Ruiz, Ana",
    basis: "suggested",
    signals: [],
    choice: { forecastRate: "planned", pinPlannedRate: false, distribution: "plan", ...choice },
    by: "pi@ucsf.edu",
    originMonth: "2026-09",
  });
  if (!linked.ok) throw new Error(linked.reason);
  return linked;
}

describe("8. forecast-rate precedence and the run-date closure test", () => {
  it("closes a month only when the report was run on or after the first of the next month, by the local day it was run", () => {
    expect(isMonthClosedByRunDate("2026-08", "2026-08-16T12:00:00.000Z")).toBe(false);
    expect(isMonthClosedByRunDate("2026-08", "2026-09-01T12:00:00.000Z")).toBe(true);
    expect(isMonthClosedByRunDate("2026-08", "2026-09-01")).toBe(true);
    expect(isMonthClosedByRunDate("2026-08", undefined)).toBe(false);
    // The parser stores the Excel run date as an ISO instant built from local
    // time. An evening run on the last day of the month is still that month —
    // its UTC day may already be the first of the next.
    expect(isMonthClosedByRunDate("2026-08", new Date(2026, 7, 31, 23, 0).toISOString())).toBe(false);
    expect(isMonthClosedByRunDate("2026-08", new Date(2026, 8, 1, 0, 30).toISOString())).toBe(true);
  });

  it("never lets a partial or in-progress month be the rate reference", () => {
    // Aug in progress (run Aug 16): nothing closed, the plan's rate stands.
    const inProgress = currentSnapshot();
    expect(closedFullMonths(inProgress, "e2")).toEqual([]);
    expect(resolveForecastRate({ plan: plan(), employee: ana(), snapshot: inProgress, choice: undefined })).toEqual({ source: "planned", monthlyRate: 7920 });

    // Run Oct 1: Aug and Sep are closed, but Aug is Ana's first charged month
    // (possibly partial), so September is the first closed full month.
    const sep = septemberReport();
    expect(closedFullMonths(sep, "e2")).toEqual(["2026-09"]);
    expect(latestClosedFullMonth(sep, "e2")).toBe("2026-09");
    const rate = resolveForecastRate({ plan: plan(), employee: ana(), snapshot: sep, choice: undefined });
    expect(rate.source).toBe("closedMonth");
    expect(rate.sourceMonth).toBe("2026-09");
    expect(rate.monthlyRate).toBeCloseTo(calculateMonthlyCost("e2", "2026-09", sep.monthlyCosts).total, 5);
    expect(rate.monthlyRate).toBeCloseTo(8580, 5);
  });

  it("orders pinned planned → closed month → FY rate → planned, with the posted amount as the legacy path", () => {
    const sep = septemberReport();
    const withFy = { ...ana(), annualSalary: 90000 };
    const pinned = link({ pinPlannedRate: true });
    expect(resolveForecastRate({ plan: plan(), employee: withFy, snapshot: sep, choice: pinned.choice })).toEqual({ source: "pinnedPlanned", monthlyRate: 7920 });

    const fy = link({ forecastRate: "fyRate" });
    expect(resolveForecastRate({ plan: plan(), employee: withFy, snapshot: sep, choice: fy.choice }).source).toBe("closedMonth");
    const fyPreClosure = resolveForecastRate({ plan: plan(), employee: withFy, snapshot: currentSnapshot(), choice: fy.choice });
    expect(fyPreClosure.source).toBe("fyRate");
    expect(fyPreClosure.monthlyRate).toBeCloseTo((90000 / 12) * 1.32, 5);
    // No FY rate on file: the choice falls through to the planned rate.
    expect(resolveForecastRate({ plan: plan(), employee: ana(), snapshot: currentSnapshot(), choice: fy.choice })).toEqual({ source: "planned", monthlyRate: 7920 });

    const posted = link({ forecastRate: "payrollActual" });
    expect(resolveForecastRate({ plan: plan(), employee: ana(), snapshot: currentSnapshot(), choice: posted.choice })).toEqual({ source: "payrollActual", monthlyRate: null });

    // The engine uses the resolved rate for forecast months only. Origin
    // (Oct, a payroll month) stays the payroll-derived figure whatever the
    // rate; Nov onward follows the resolved rate — 8,580 from the closed
    // month, or the pinned 7,920 — which is how the two are told apart.
    const burnOf = (settings: ReturnType<typeof settingsWith>, month: string, employeeId: string) =>
      simulateProjections({ snapshot: sep, workingPlan: null, settings, balances: balances(), now: new Date(2026, 9, 15) })
        .states.find((s) => s.month === month)!
        .allocations.filter((a) => a.employeeId === employeeId)
        .reduce((s, a) => s + a.monthlyBurn, 0);
    expect(burnOf(link().settings, "2026-11", "e2")).toBeCloseTo(8580, 5);
    expect(burnOf(link({ pinPlannedRate: true }).settings, "2026-11", "e2")).toBeCloseTo(7920, 5);
    expect(burnOf(link({ pinPlannedRate: true }).settings, "2026-10", "e2")).toBeCloseTo(
      burnOf(link().settings, "2026-10", "e2"),
      5
    );
    expect(burnOf(link().settings, "2026-11", "e1")).toBeCloseTo(10000, 5);
  });

  it("scales a closed-month rate from the effort posted that month, so the forecast continues the posted burn", () => {
    // Ana posted 50% in September at $4,290 total; the plan splits her 60/40
    // from October. Her forecast burn must be $4,290 × (100 ÷ 50), not
    // $4,290 × (100 ÷ 100) — the closed month's total already reflects 50%.
    const actual = [...ACTUAL_MONTHS, "2026-09"];
    const half = currentSnapshot({
      allocations: [
        ...actual.map((m) => alloc("e1", "f1", m, 100, "actual")),
        alloc("e2", "f1", "2026-08", 50, "actual"),
        alloc("e2", "f1", "2026-09", 50, "actual"),
      ],
      costs: [...actual.flatMap((m) => costs("e1", m, 10000)), ...costs("e2", "2026-08", 2145), ...costs("e2", "2026-09", 4290)],
      actualMonths: actual,
      futureMonths: [],
      reportDate: "2026-10-01T12:00:00.000Z",
    });
    const result = simulateProjections({ snapshot: half, workingPlan: null, settings: link().settings, balances: balances(), now: new Date(2026, 9, 15) });
    const nov = result.states.find((s) => s.month === "2026-11")!.allocations.filter((a) => a.employeeId === "e2");
    expect(nov.map((a) => a.percentEffort).sort()).toEqual([40, 60]);
    expect(nov.reduce((s, a) => s + a.monthlyBurn, 0)).toBeCloseTo(8580, 5);
  });
});

describe("a link made after a full month has already closed", () => {
  it("records the rate in force at link time, so the next import writes no switch that never happened", () => {
    const sep = septemberReport();
    const linked = link();
    const atLink = rateAtLinkEvent({ plan: plan(), employee: ana(), snapshot: sep, linkId: linked.link.id, choice: linked.choice, by: "pi@ucsf.edu" });
    expect(atLink?.type).toBe("rateSwitch");
    expect(atLink?.detail).toMatchObject({ oldSource: "none", newRate: 8580, sourceMonth: "2026-09", reportFile: "payroll-sep.xlsx" });
    const settings = appendEvents(linked.settings, atLink ? [atLink] : []);
    expect(rateSwitchEventsForImport({ snapshot: sep, settings, by: "pi@ucsf.edu", reportFile: "payroll-oct.xlsx" })).toEqual([]);
    // Nothing closed yet, or pinned: no rate row at link time.
    expect(rateAtLinkEvent({ plan: plan(), employee: ana(), snapshot: currentSnapshot(), linkId: "x", choice: linked.choice, by: "pi" })).toBeNull();
    expect(rateAtLinkEvent({ plan: plan(), employee: ana(), snapshot: sep, linkId: "x", choice: link({ pinPlannedRate: true }).choice, by: "pi" })).toBeNull();
  });
});

describe("9. the automatic rate switch", () => {
  it("fires exactly once when the first closed full month arrives, never when pinned, and not again on re-import", () => {
    const linked = link();
    const noneYet = rateSwitchEventsForImport({ snapshot: currentSnapshot(), settings: linked.settings, by: "pi@ucsf.edu", reportFile: "payroll-aug.xlsx" });
    expect(noneYet).toEqual([]);

    const sep = septemberReport();
    const events = rateSwitchEventsForImport({ snapshot: sep, settings: linked.settings, by: "pi@ucsf.edu", reportFile: "payroll-sep.xlsx" });
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("rateSwitch");
    expect(event.by).toBe("pi@ucsf.edu");
    expect(event.linkId).toBe(linked.link.id);
    expect(event.detail).toMatchObject({ oldRate: 7920, newRate: 8580, sourceMonth: "2026-09", reportFile: "payroll-sep.xlsx" });
    expect(event.summary).toContain("Ruiz, Ana");
    expect(event.summary).toContain("Sep 2026");
    expect(resolveForecastRate({ plan: plan(), employee: ana(), snapshot: sep, choice: linked.choice }).source).toBe("closedMonth");

    const after = appendEvents(linked.settings, events);
    expect(rateSwitchEventsForImport({ snapshot: sep, settings: after, by: "pi@ucsf.edu", reportFile: "payroll-sep.xlsx" })).toEqual([]);

    const pinned = link({ pinPlannedRate: true });
    expect(rateSwitchEventsForImport({ snapshot: sep, settings: pinned.settings, by: "pi@ucsf.edu", reportFile: "payroll-sep.xlsx" })).toEqual([]);
    expect(resolveForecastRate({ plan: plan(), employee: ana(), snapshot: sep, choice: pinned.choice })).toEqual({ source: "pinnedPlanned", monthlyRate: 7920 });
  });
});
