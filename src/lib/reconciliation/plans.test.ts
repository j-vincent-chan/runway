import { describe, expect, it } from "vitest";
import { simulateProjections } from "@/lib/projections/simulate";
import { depletionRootOf } from "@/lib/projections/depletion";
import { checkChartstringRemoval } from "@/lib/projections/removal";
import { applyLink, applyUnlink, updatePlannedHire } from "@/lib/reconciliation/mutations";
import { plannedPersonKey } from "@/lib/reconciliation/plans";
import { balances, currentSnapshot, KEY_A, KEY_B, NOW, settingsWith } from "@/lib/reconciliation/fixtures";

const PLAN_KEY = plannedPersonKey("p1");

function linked(choice: Partial<{ forecastRate: "planned" | "fyRate" | "payrollActual"; pinPlannedRate: boolean; distribution: "plan" | "payrollFuture" }> = {}) {
  const linkedSettings = applyLink(settingsWith(), {
    plannedHireId: "p1",
    employeePersonKey: "hr:02987654",
    employeeName: "Ruiz, Ana",
    basis: "suggested",
    signals: ["newInReport", "startWindow", "sharedAccount", "title"],
    choice: { forecastRate: "planned", pinPlannedRate: false, distribution: "plan", ...choice },
    by: "pi@ucsf.edu",
    originMonth: "2026-09",
  });
  if (!linkedSettings.ok) throw new Error(linkedSettings.reason);
  return linkedSettings;
}

describe("1. a linked plan is counted once", () => {
  it("emits no allocation for planned:{id}, and each account draws down by the person's burn exactly once", () => {
    const { settings } = linked();
    const snap = currentSnapshot();
    const result = simulateProjections({ snapshot: snap, workingPlan: null, settings, balances: balances(), now: NOW });

    expect(result.plannedEntities).toEqual([]);
    for (const state of result.states) {
      expect(state.allocations.some((a) => a.personKey === PLAN_KEY)).toBe(false);
      expect(state.allocations.some((a) => a.employeeId === PLAN_KEY)).toBe(false);
    }

    // Ana's monthly burn is the sum of her allocations' burns — her plan's rate,
    // split 60/40, from the first forecast month.
    const oct = result.states.find((s) => s.month === "2026-10")!;
    const anaOct = oct.allocations.filter((a) => a.employeeId === "e2");
    expect(anaOct.map((a) => a.percentEffort).sort()).toEqual([40, 60]);
    expect(anaOct.reduce((s, a) => s + a.monthlyBurn, 0)).toBeCloseTo(7920, 5);

    // Account drawdown counts her exactly once: each month's remaining balance
    // on Startup falls by the burn of every allocation charged to it that month.
    const root = depletionRootOf(KEY_A);
    for (let i = 1; i < result.states.length; i++) {
      const prev = result.states[i - 1]!.remainingByRoot[root]!;
      const cur = result.states[i]!.remainingByRoot[root]!;
      const charged = result.states[i]!.allocations
        .filter((a) => depletionRootOf(a.chartstringKey) === root)
        .reduce((s, a) => s + a.monthlyBurn, 0);
      expect(prev - cur).toBeCloseTo(Math.min(charged, prev), 3);
    }
  });
});

describe("5. unlink is reversible", () => {
  it("leaves imported rows and the plan's rules intact, simulates the planned row again, and appends the reversal", () => {
    const snap = currentSnapshot();
    const before = JSON.parse(JSON.stringify(snap));
    const { settings: linkedSettings, link } = linked();
    const rulesBefore = JSON.parse(JSON.stringify(settingsWith().projectionRules));

    // The engine runs over the same snapshot object before, during and after
    // the link; the imported rows it read must be byte-identical afterwards,
    // and the posted (origin) month must project the same either way.
    const postedBefore = simulateProjections({ snapshot: snap, workingPlan: null, settings: settingsWith(), balances: balances(), now: NOW })
      .states.find((s) => s.month === "2026-09")!.allocations.filter((a) => a.employeeId === "e2");
    simulateProjections({ snapshot: snap, workingPlan: null, settings: linkedSettings, balances: balances(), now: NOW });

    const unlinked = applyUnlink(linkedSettings, link.id, "pi@ucsf.edu", "Ruiz, Ana");
    expect(unlinked.ok).toBe(true);
    if (!unlinked.ok) return;

    const result = simulateProjections({ snapshot: snap, workingPlan: null, settings: unlinked.settings, balances: balances(), now: NOW });
    expect(snap.monthlyAllocations).toEqual(before.monthlyAllocations);
    expect(snap.monthlyCosts).toEqual(before.monthlyCosts);
    expect(result.states.find((s) => s.month === "2026-09")!.allocations.filter((a) => a.employeeId === "e2")).toEqual(postedBefore);
    expect(unlinked.settings.projectionRules).toEqual(rulesBefore);
    expect(result.plannedEntities.map((e) => e.id)).toEqual([PLAN_KEY]);
    const oct = result.states.find((s) => s.month === "2026-10")!;
    expect(oct.allocations.filter((a) => a.personKey === PLAN_KEY).map((a) => a.percentEffort).sort()).toEqual([40, 60]);

    const reversed = unlinked.settings.personLinks!.find((l) => l.id === link.id)!;
    expect(reversed.reversedAt).toBeTruthy();
    expect(reversed.reversedBy).toBe("pi@ucsf.edu");
    const events = unlinked.settings.reconciliationEvents!.map((e) => e.type);
    expect(events).toEqual(["link", "unlink"]);
  });
});

describe("a link whose person is no longer on the report", () => {
  it("counts the plan once — as its own row again — instead of zero times", () => {
    const { settings } = linked();
    const withoutAna = currentSnapshot({
      employees: currentSnapshot().employees.filter((e) => e.id !== "e2"),
      allocations: currentSnapshot().monthlyAllocations.filter((a) => a.employeeId !== "e2"),
      costs: currentSnapshot().monthlyCosts.filter((c) => c.employeeId !== "e2"),
    });
    const result = simulateProjections({ snapshot: withoutAna, workingPlan: null, settings, balances: balances(), now: NOW });
    expect(result.plannedEntities.map((e) => e.id)).toEqual([PLAN_KEY]);
    const oct = result.states.find((s) => s.month === "2026-10")!;
    expect(oct.allocations.filter((a) => a.personKey === PLAN_KEY).reduce((s, a) => s + a.monthlyBurn, 0)).toBeCloseTo(7920, 5);
  });
});

describe("a linked person's plan-derived account on the grid", () => {
  it("is refused for removal with the plan named, never silently ignored", () => {
    const { settings } = linked();
    const snap = currentSnapshot();
    const result = simulateProjections({ snapshot: snap, workingPlan: null, settings, balances: balances(), now: NOW });
    // R01 comes to Ana only through the plan's rule.
    const check = checkChartstringRemoval({
      snapshot: snap,
      workingPlan: null,
      settings,
      employeeId: "e2",
      personKey: "hr:02987654",
      chartstringKey: KEY_B,
      originMonth: result.originMonth,
      resolvedRules: result.rules,
    });
    expect(check).toEqual({ removable: false, reason: "linkedPlan", planName: "Postdoc (TBD)" });
    // The grid reads the rule that drives the cell from the run, not from storage.
    expect(result.rules.some((r) => r.personKey === "hr:02987654" && r.chartstringKey === KEY_B && r.trigger.type === "setEffort")).toBe(true);
  });

  it("keeps the plan's effort when the person adds an off-ramp of their own on the same account, and drops it for their own effort", () => {
    const { settings } = linked();
    const snap = currentSnapshot();
    const ownOffRamp = {
      ...settings,
      projectionRules: [
        ...settings.projectionRules!,
        { id: "own-off", personKey: "hr:02987654", chartstringKey: KEY_B, trigger: { type: "onDate" as const, month: "2026-11" }, remainder: { kind: "uncovered" as const }, applyOverPayroll: true },
      ],
    };
    const r1 = simulateProjections({ snapshot: snap, workingPlan: null, settings: ownOffRamp, balances: balances(), now: NOW });
    const pctAt = (result: typeof r1, month: string) =>
      result.states.find((s) => s.month === month)!.allocations.find((a) => a.employeeId === "e2" && a.chartstringKey === KEY_B)?.percentEffort ?? 0;
    expect(pctAt(r1, "2026-10")).toBe(60);
    expect(pctAt(r1, "2026-11")).toBe(60);
    expect(pctAt(r1, "2026-12")).toBe(0);

    const ownEffort = {
      ...settings,
      projectionRules: [
        ...settings.projectionRules!,
        { id: "own-set", personKey: "hr:02987654", chartstringKey: KEY_B, trigger: { type: "setEffort" as const, fromMonth: "2026-10", percentEffort: 25 }, remainder: { kind: "uncovered" as const }, applyOverPayroll: true },
      ],
    };
    const r2 = simulateProjections({ snapshot: snap, workingPlan: null, settings: ownEffort, balances: balances(), now: NOW });
    expect(pctAt(r2, "2026-12")).toBe(25);
  });
});

describe("the Planned start editor", () => {
  it("never stores a partial month", () => {
    const settings = settingsWith();
    expect(updatePlannedHire(settings, "p1", { startMonth: "2" })).toBe(settings);
    expect(updatePlannedHire(settings, "p1", { startMonth: "2026-1" })).toBe(settings);
    expect(updatePlannedHire(settings, "p1", { startMonth: "2026-13" })).toBe(settings);
    const moved = updatePlannedHire(settings, "p1", { startMonth: "2026-11" });
    expect(moved.plannedHires![0]!.startMonth).toBe("2026-11");
    expect(moved.projectionRules!.every((r) => r.trigger.type === "setEffort" && r.trigger.fromMonth === "2026-11")).toBe(true);
  });
});

describe("adopting payroll's future distribution", () => {
  it("still lets the person's own off-ramp fire and stay off", () => {
    // Payroll's future rows say 100% Startup every month; a fundsDepleted rule
    // of Ana's own takes her off Startup once it is dry. The row must not put
    // her back on the next month.
    const base = applyLink(settingsWith(), {
      plannedHireId: "p1",
      employeePersonKey: "hr:02987654",
      employeeName: "Ruiz, Ana",
      basis: "manual",
      signals: [],
      choice: { forecastRate: "planned", pinPlannedRate: false, distribution: "payrollFuture" },
      by: "pi@ucsf.edu",
      originMonth: "2026-09",
    });
    if (!base.ok) throw new Error(base.reason);
    const settings = {
      ...base.settings,
      projectionRules: [
        ...base.settings.projectionRules!,
        { id: "own-dry", personKey: "hr:02987654", chartstringKey: KEY_A, trigger: { type: "fundsDepleted" as const }, remainder: { kind: "uncovered" as const }, applyOverPayroll: true },
      ],
    };
    // Startup opens with enough for about two months of Ada + Ana.
    const tight = new Map(balances());
    tight.set(KEY_A, { balance: 30000 } as never);
    const result = simulateProjections({ snapshot: currentSnapshot(), workingPlan: null, settings, balances: tight, now: NOW });
    const anaOnStartup = result.states.map((s) => s.allocations.find((a) => a.employeeId === "e2" && a.chartstringKey === KEY_A)?.percentEffort ?? 0);
    const firstOff = anaOnStartup.findIndex((p) => p === 0);
    expect(firstOff).toBeGreaterThan(0);
    expect(anaOnStartup.slice(firstOff).every((p) => p === 0)).toBe(true);
  });
});
