import { describe, expect, it } from "vitest";
import type { PayrollReportSnapshot } from "@/types";
import { foldPayrollImports } from "@/lib/import/foldPayrollImports";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { rateSwitchEventsForImport } from "@/lib/reconciliation/forecastRate";
import { applyLink } from "@/lib/reconciliation/mutations";
import { suggestMatches, suggestionPairKey } from "@/lib/reconciliation/suggest";
import { describeFoldOutcome, buildReconciliationView, latestPayrollImport, previousFold } from "@/lib/reconciliation/view";
import {
  ACTUAL_MONTHS,
  ana,
  alloc,
  costs,
  currentSnapshot,
  FUTURE_MONTHS,
  importOf,
  plan,
  planRules,
  previousSnapshot,
  settingsWith,
  snapshot,
} from "@/lib/reconciliation/fixtures";

/**
 * mergePayrollSnapshots regenerates row ids, stamps uploadedAt and appends a
 * merge warning by design, so "the same fold" is compared on what the rows
 * say — who, which account, which month, how much — not on their ids.
 */
function canonical(s: PayrollReportSnapshot) {
  const keyOf = new Map(s.employees.map((e) => [e.id, employeePersonKey(e)]));
  const srcOf = new Map(s.fundingSources.map((f) => [f.id, f.accountString ?? f.rawName]));
  return {
    employees: s.employees.map((e) => `${employeePersonKey(e)}|${e.name}|${e.role ?? ""}|${e.appointmentPercent}`).sort(),
    sources: [...srcOf.values()].sort(),
    allocations: s.monthlyAllocations
      .map((a) => `${keyOf.get(a.employeeId)}|${srcOf.get(a.fundingSourceId)}|${a.month}|${a.percentEffort}|${a.sourceType}`)
      .sort(),
    costs: s.monthlyCosts.map((c) => `${keyOf.get(c.employeeId)}|${c.month}|${c.rowType}|${c.amount}`).sort(),
    actualMonths: s.actualMonths,
    futureMonths: s.futureMonths,
    monthRange: s.monthRange,
  };
}

describe("2. re-uploading the same report changes nothing", () => {
  it("folds to the same rows, leaves links, dismissals and events alone, and suggests the same set", () => {
    const prev = importOf(previousSnapshot(), "2026-08-02T12:00:00.000Z", "imp-prev");
    const aug = importOf(currentSnapshot(), "2026-09-01T12:00:00.000Z", "imp-aug");
    const augAgain = importOf(currentSnapshot(), "2026-09-16T12:00:00.000Z", "imp-aug-2");

    const once = foldPayrollImports([prev, aug])!;
    const twice = foldPayrollImports([prev, aug, augAgain])!;
    expect(canonical(twice)).toEqual(canonical(once));

    const linked = applyLink(settingsWith(), {
      plannedHireId: "p1",
      employeePersonKey: "hr:02987654",
      employeeName: "Ruiz, Ana",
      basis: "suggested",
      signals: [],
      choice: { forecastRate: "planned", pinPlannedRate: false, distribution: "plan" },
      by: "pi@ucsf.edu",
      originMonth: "2026-09",
    });
    if (!linked.ok) throw new Error(linked.reason);
    const settings = {
      ...linked.settings,
      matchDismissals: [{ plannedHireId: "p9", employeePersonKey: "hr:1", at: "2026-09-01T12:00:00.000Z", by: "pi@ucsf.edu" }],
    };
    const before = JSON.parse(JSON.stringify(settings));
    // No closed full month for Ana in either fold, so the import adds no event.
    expect(rateSwitchEventsForImport({ snapshot: once, settings, by: "pi@ucsf.edu", reportFile: aug.sourceFileName })).toEqual([]);
    expect(rateSwitchEventsForImport({ snapshot: twice, settings, by: "pi@ucsf.edu", reportFile: augAgain.sourceFileName })).toEqual([]);
    expect(settings).toEqual(before);

    // A re-upload of the same report is not an earlier report: both folds are
    // measured against the July report alone, so Ana stays new and suggested.
    const unlinked = settingsWith();
    expect(canonical(previousFold([prev, aug, augAgain])!)).toEqual(canonical(previousFold([prev, aug])!));
    const s1 = suggestMatches({ snapshot: once, previousSnapshot: previousFold([prev, aug]), plans: unlinked.plannedHires!, links: [], dismissals: [], rules: unlinked.projectionRules! });
    const s2 = suggestMatches({ snapshot: twice, previousSnapshot: previousFold([prev, aug, augAgain]), plans: unlinked.plannedHires!, links: [], dismissals: [], rules: unlinked.projectionRules! });
    expect(s1.map(suggestionPairKey)).toEqual(["p1|hr:02987654"]);
    expect(s2.map(suggestionPairKey)).toEqual(s1.map(suggestionPairKey));

    // A browser-renamed re-download of the same report is the same report too.
    const renamed = importOf({ ...currentSnapshot(), sourceFileName: "payroll-aug (1).xlsx" }, "2026-09-20T12:00:00.000Z", "imp-aug-3");
    expect(canonical(previousFold([prev, aug, renamed])!)).toEqual(canonical(previousFold([prev, aug])!));
    const s3 = suggestMatches({ snapshot: foldPayrollImports([prev, aug, renamed])!, previousSnapshot: previousFold([prev, aug, renamed]), plans: unlinked.plannedHires!, links: [], dismissals: [], rules: unlinked.projectionRules! });
    expect(s3.map(suggestionPairKey)).toEqual(s1.map(suggestionPairKey));

    // Backfilling an older report *after* the newer one changes nothing either:
    // "the latest report" is the one that reaches furthest, not the last upload.
    const backfilled = [importOf(currentSnapshot(), "2026-09-01T12:00:00.000Z", "imp-aug"), importOf(previousSnapshot(), "2026-09-30T12:00:00.000Z", "imp-prev-late")];
    expect(latestPayrollImport(backfilled)?.id).toBe("imp-aug");
    expect(canonical(previousFold(backfilled)!)).toEqual(canonical(previousSnapshot()));

    // And the upload's own outcome line says so.
    const viewOnce = buildReconciliationView({ snapshot: once, payrollImports: [prev, aug], settings: unlinked });
    const viewTwice = buildReconciliationView({ snapshot: twice, payrollImports: [prev, aug, augAgain], settings: unlinked });
    const outcome = describeFoldOutcome({ before: viewOnce, after: viewTwice, replacedMonths: twice.actualMonths, preservedMonths: [], newEmployees: [], eventsAdded: 0 });
    expect(outcome.suggestionsUnchanged).toBe(true);
    expect(outcome.suggestionCount).toBe(1);
    expect(outcome.newEmployees).toEqual([]);
  });
});

describe("7. the suggestion gate", () => {
  const base = () => ({ snapshot: currentSnapshot(), previousSnapshot: previousSnapshot(), links: [], dismissals: [], rules: planRules() });

  it("suggests when new, first charged within a month of the start, and one shared signal holds", () => {
    const out = suggestMatches({ ...base(), plans: [plan()] });
    expect(out).toHaveLength(1);
    expect(out[0]!.signals.map((s) => `${s.id}:${s.status}`)).toEqual([
      "newInReport:pass",
      "startWindow:pass",
      "sharedAccount:pass",
      "title:pass",
      "name:neutral",
    ]);
  });

  it("never suggests on name alone or title alone", () => {
    // Name matches, but Ana is not new — she was on the earlier report too.
    const named = plan({ displayName: "Ana Ruiz", role: undefined });
    const prevWithAna = snapshot({
      ...previousSnapshot(),
      employees: [...previousSnapshot().employees, ana()],
      allocations: [...previousSnapshot().monthlyAllocations, alloc("e2", "f1", "2026-07", 100, "actual")],
      costs: [...previousSnapshot().monthlyCosts, ...costs("e2", "2026-07", 4000)],
      actualMonths: previousSnapshot().actualMonths,
    });
    expect(suggestMatches({ ...base(), previousSnapshot: prevWithAna, plans: [named] })).toEqual([]);

    // Title matches, but the planned start is three months from her first charged month.
    const farStart = plan({ startMonth: "2026-11" });
    expect(suggestMatches({ ...base(), plans: [farStart], rules: planRules("p1", "2026-11") })).toEqual([]);

    // Neither an account, a title nor a name in common: nothing to suggest on.
    const stranger = plan({ role: "Lab manager", displayName: "Lab manager (TBD)" });
    const otherAccount = planRules().map((r) => ({ ...r, chartstringKey: "9999-1-0000000-00" }));
    expect(suggestMatches({ ...base(), plans: [stranger], rules: otherAccount })).toEqual([]);
  });

  it("excludes dismissed pairs and people already linked, and needs an earlier report to call anyone new", () => {
    expect(
      suggestMatches({ ...base(), plans: [plan()], dismissals: [{ plannedHireId: "p1", employeePersonKey: "hr:02987654", at: "x", by: "pi" }] })
    ).toEqual([]);
    expect(
      suggestMatches({
        ...base(),
        plans: [plan(), plan({ id: "p2", displayName: "Second postdoc (TBD)" })],
        rules: [...planRules(), ...planRules("p2")],
        links: [{ id: "l1", plannedHireId: "p1", employeePersonKey: "hr:02987654", basis: "manual", signals: [], linkedAt: "x", linkedBy: "pi" }],
      })
    ).toEqual([]);
    expect(suggestMatches({ ...base(), previousSnapshot: null, plans: [plan()] })).toEqual([]);
    // A future row on a plan's account is not a charge: with Ana posted only
    // to R01's sibling account and a future row on Startup, the signal fails.
    const futureOnPlanAccount = currentSnapshot({
      allocations: [
        ...ACTUAL_MONTHS.map((m) => alloc("e1", "f1", m, 100, "actual")),
        alloc("e2", "f2", "2026-08", 100, "actual"),
        ...FUTURE_MONTHS.map((m) => alloc("e2", "f1", m, 100, "future")),
      ],
      costs: [...ACTUAL_MONTHS.flatMap((m) => costs("e1", m, 10000)), ...costs("e2", "2026-08", 4290, "f2")],
    });
    const startupOnly = planRules().filter((r) => r.chartstringKey === "7000-1-7030720-45");
    const noRole = plan({ role: undefined });
    expect(suggestMatches({ ...base(), snapshot: futureOnPlanAccount, plans: [noRole], rules: startupOnly })).toEqual([]);
    // Future-only rows are not posted pay: a person the report only plans for is not "new".
    const futureOnly = currentSnapshot({
      allocations: [...ACTUAL_MONTHS.map((m) => alloc("e1", "f1", m, 100, "actual")), ...FUTURE_MONTHS.map((m) => alloc("e2", "f1", m, 100, "future"))],
      costs: ACTUAL_MONTHS.flatMap((m) => costs("e1", m, 10000)),
    });
    expect(suggestMatches({ ...base(), snapshot: futureOnly, plans: [plan()] })).toEqual([]);
  });
});
