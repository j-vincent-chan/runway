import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/types";
import type { StoredAppState } from "@/lib/storage/localStorage";
import { cloudWorkspaceToStored, toCloudWorkspacePayload } from "@/lib/supabase/workspace";
import { canUseCloudSync } from "@/lib/supabase/cloudGate";
import { simulateProjections } from "@/lib/projections/simulate";
import { applyLink } from "@/lib/reconciliation/mutations";
import { looksLikePlaceholder } from "@/lib/reconciliation/plans";
import { evaluateMatchSignals, suggestMatches } from "@/lib/reconciliation/suggest";
import {
  ana,
  balances,
  currentSnapshot,
  KEY_A,
  KEY_B,
  NOW,
  plan,
  planRules,
  previousSnapshot,
  settingsWith,
} from "@/lib/reconciliation/fixtures";

function anaMix(settings: ReturnType<typeof settingsWith>, month: string) {
  const result = simulateProjections({ snapshot: currentSnapshot(), workingPlan: null, settings, balances: balances(), now: NOW });
  const state = result.states.find((s) => s.month === month)!;
  return Object.fromEntries(state.allocations.filter((a) => a.employeeId === "e2").map((a) => [a.chartstringKey, a.percentEffort]));
}

describe("3. the plan's rules survive linking", () => {
  const link = (distribution: "plan" | "payrollFuture") =>
    applyLink(settingsWith(), {
      plannedHireId: "p1",
      employeePersonKey: "hr:02987654",
      employeeName: "Ruiz, Ana",
      basis: "suggested",
      signals: [],
      choice: { forecastRate: "planned", pinPlannedRate: false, distribution },
      by: "pi@ucsf.edu",
      originMonth: "2026-09",
    });

  it("projects 60/40 from the month after origin while the imported future rows say 100% Startup", () => {
    const linked = link("plan");
    if (!linked.ok) throw new Error(linked.reason);
    expect(anaMix(linked.settings, "2026-09")).toEqual({ [KEY_A]: 100 }); // origin: the report's own row
    expect(anaMix(linked.settings, "2026-10")).toEqual({ [KEY_B]: 60, [KEY_A]: 40 });
    expect(anaMix(linked.settings, "2026-12")).toEqual({ [KEY_B]: 60, [KEY_A]: 40 });
  });

  it("adopts payroll's future distribution only by the explicit choice, and records it", () => {
    const linked = link("payrollFuture");
    if (!linked.ok) throw new Error(linked.reason);
    expect(linked.choice.distribution).toBe("payrollFuture");
    expect(linked.settings.reconciliationChoices!.find((c) => c.linkId === linked.link.id)!.distribution).toBe("payrollFuture");
    expect(anaMix(linked.settings, "2026-10")).toEqual({ [KEY_A]: 100 });
    // The plan's rules are still stored, untouched, under the plan's key.
    expect(linked.settings.projectionRules).toEqual(planRules());
  });
});

describe("4. an unnamed plan links manually", () => {
  it("treats role placeholders as unnamed and real names as names", () => {
    for (const name of ["Postdoc (TBD)", "Lab manager", "Grant writer", "Clinical coordinator", "Hire 2", "Bioinformatician"]) {
      expect(looksLikePlaceholder(name), name).toBe(true);
    }
    for (const name of ["Ana Ruiz", "Ruiz, Ana", "Francisco J Quintanilla Mejia", "Xochitl Vargas"]) {
      expect(looksLikePlaceholder(name), name).toBe(false);
    }
  });

  it("gets no name signal, is never suggested on name, and links with basis manual", () => {
    const unnamed = plan({ displayName: "Postdoc (TBD)", role: undefined });
    const rulesOnOtherAccount = planRules().map((r) => ({ ...r, chartstringKey: "9999-1-0000000-00" }));
    const signals = evaluateMatchSignals({
      snapshot: currentSnapshot(),
      previousSnapshot: previousSnapshot(),
      plan: unnamed,
      employee: ana(),
      rules: rulesOnOtherAccount,
    });
    expect(signals.signals.find((s) => s.id === "name")!.status).toBe("neutral");
    expect(
      suggestMatches({ snapshot: currentSnapshot(), previousSnapshot: previousSnapshot(), plans: [unnamed], links: [], dismissals: [], rules: rulesOnOtherAccount })
    ).toEqual([]);

    const linked = applyLink(settingsWith({ plannedHires: [unnamed], projectionRules: rulesOnOtherAccount }), {
      plannedHireId: "p1",
      employeePersonKey: "hr:02987654",
      employeeName: "Ruiz, Ana",
      basis: "manual",
      signals: [],
      choice: { forecastRate: "planned", pinPlannedRate: false, distribution: "plan" },
      by: "pi@ucsf.edu",
      originMonth: "2026-09",
    });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.link.basis).toBe("manual");
    expect(linked.settings.personLinks).toHaveLength(1);
  });
});

describe("6. events carry the actor and sync inside the workspace JSON", () => {
  it("records who and when, round-trips through the cloud payload, and sits behind canUseCloudSync like every setting", () => {
    const linked = applyLink(settingsWith(), {
      plannedHireId: "p1",
      employeePersonKey: "hr:02987654",
      employeeName: "Ruiz, Ana",
      basis: "suggested",
      signals: ["newInReport"],
      choice: { forecastRate: "planned", pinPlannedRate: false, distribution: "plan" },
      by: "analyst@ucsf.edu",
      at: "2026-09-16T17:00:00.000Z",
      originMonth: "2026-09",
    });
    if (!linked.ok) throw new Error(linked.reason);
    const event = linked.settings.reconciliationEvents![0]!;
    expect(event.type).toBe("link");
    expect(event.by).toBe("analyst@ucsf.edu");
    expect(event.at).toBe("2026-09-16T17:00:00.000Z");
    expect(new Date(event.at).toISOString()).toBe(event.at);

    const state: StoredAppState = { snapshot: currentSnapshot(), workingPlan: null, scenarios: [], settings: linked.settings };
    const payload = toCloudWorkspacePayload(state, "2026-09-16T18:00:00.000Z");
    const back = cloudWorkspaceToStored(JSON.parse(JSON.stringify(payload)));
    expect(back.settings.reconciliationEvents).toEqual(linked.settings.reconciliationEvents);
    expect(back.settings.personLinks).toEqual(linked.settings.personLinks);
    expect(back.settings.reconciliationChoices).toEqual(linked.settings.reconciliationChoices);

    expect(canUseCloudSync({ configured: true, signedIn: true, localOnly: false })).toBe(true);
    expect(canUseCloudSync({ configured: true, signedIn: true, localOnly: true })).toBe(false);
    expect(canUseCloudSync({ configured: true, signedIn: false, localOnly: false })).toBe(false);
    // The defaults ship empty so a workspace saved before the records existed reads cleanly.
    expect(DEFAULT_SETTINGS.reconciliationEvents).toEqual([]);
  });
});
