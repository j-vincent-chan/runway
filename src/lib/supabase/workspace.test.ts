import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/types";
import type { AppSettings } from "@/types";
import type { StoredAppState } from "@/lib/storage/localStorage";
import {
  cloudWorkspaceToStored,
  pickWorkspace,
  toCloudWorkspacePayload,
  workspaceHasCustomSettings,
  type CloudWorkspacePayload,
} from "@/lib/supabase/workspace";

function local(partial: Partial<StoredAppState> = {}): StoredAppState {
  return {
    snapshot: null,
    workingPlan: null,
    scenarios: [],
    settings: DEFAULT_SETTINGS,
    ...partial,
  };
}

function cloud(partial: Partial<CloudWorkspacePayload> = {}): CloudWorkspacePayload {
  return {
    version: 1,
    updatedAt: "2026-08-19T20:00:00.000Z",
    snapshot: null,
    workingPlan: null,
    scenarios: [],
    settings: DEFAULT_SETTINGS,
    ...partial,
  };
}

describe("pickWorkspace", () => {
  it("keeps local when cloud is empty", () => {
    const snap = { id: "local" } as StoredAppState["snapshot"];
    const picked = pickWorkspace(local({ snapshot: snap, savedAt: "2026-08-01T00:00:00.000Z" }), null);
    expect(picked.snapshot).toBe(snap);
  });

  it("uses cloud payroll when this browser has none", () => {
    const snap = { id: "cloud" } as StoredAppState["snapshot"];
    const picked = pickWorkspace(local(), cloud({ snapshot: snap }));
    expect(picked.snapshot?.id).toBe("cloud");
    expect(picked.savedAt).toBe("2026-08-19T20:00:00.000Z");
  });

  it("uses newer cloud over older local", () => {
    const picked = pickWorkspace(
      local({
        snapshot: { id: "local" } as StoredAppState["snapshot"],
        savedAt: "2026-08-01T00:00:00.000Z",
      }),
      cloud({
        snapshot: { id: "cloud" } as CloudWorkspacePayload["snapshot"],
        updatedAt: "2026-08-19T20:00:00.000Z",
      })
    );
    expect(picked.snapshot?.id).toBe("cloud");
  });

  it("keeps newer local (offline) over older cloud", () => {
    const picked = pickWorkspace(
      local({
        snapshot: { id: "local" } as StoredAppState["snapshot"],
        savedAt: "2026-08-20T00:00:00.000Z",
      }),
      cloud({
        snapshot: { id: "cloud" } as CloudWorkspacePayload["snapshot"],
        updatedAt: "2026-08-19T20:00:00.000Z",
      })
    );
    expect(picked.snapshot?.id).toBe("local");
  });

  it("never discards local-only settings just because local has no snapshot", () => {
    // Regression: cloudHas && !localHas used to return cloudState wholesale,
    // dropping any local-only settings unconditionally.
    const picked = pickWorkspace(
      local({ settings: { ...DEFAULT_SETTINGS, hiddenEmployeeIds: ["e1"] } }),
      cloud({ snapshot: { id: "cloud" } as CloudWorkspacePayload["snapshot"] })
    );
    expect(picked.snapshot?.id).toBe("cloud");
    expect(picked.settings.hiddenEmployeeIds).toEqual(["e1"]);
  });

  it("never discards cloud-only settings just because cloud has no snapshot", () => {
    const picked = pickWorkspace(
      local({
        snapshot: { id: "local" } as StoredAppState["snapshot"],
        savedAt: "2026-08-01T00:00:00.000Z",
      }),
      cloud({ settings: { ...DEFAULT_SETTINGS, alumniEmployeeIds: ["e2"] } })
    );
    expect(picked.snapshot?.id).toBe("local");
    expect(picked.settings.alumniEmployeeIds).toEqual(["e2"]);
  });

  it("prefers the winning side's own value over the loser's when both have it", () => {
    const picked = pickWorkspace(
      local({ settings: { ...DEFAULT_SETTINGS, hiddenEmployeeIds: ["local-e"] } }),
      cloud({
        snapshot: { id: "cloud" } as CloudWorkspacePayload["snapshot"],
        settings: { ...DEFAULT_SETTINGS, hiddenEmployeeIds: ["cloud-e"] },
      })
    );
    expect(picked.settings.hiddenEmployeeIds).toEqual(["cloud-e"]);
  });
});

describe("workspaceHasCustomSettings", () => {
  it("is false for untouched defaults", () => {
    expect(workspaceHasCustomSettings(DEFAULT_SETTINGS)).toBe(false);
  });

  it("is true when any tracked field is non-empty", () => {
    expect(
      workspaceHasCustomSettings({ ...DEFAULT_SETTINGS, hiddenEmployeeFunds: ["a|b"] })
    ).toBe(true);
    expect(
      workspaceHasCustomSettings({ ...DEFAULT_SETTINGS, runwayBalanceOverrides: { "a|b": 1 } })
    ).toBe(true);
    expect(workspaceHasCustomSettings({ ...DEFAULT_SETTINGS, orgStructure: { branches: [] } })).toBe(
      true
    );
  });

  it("ignores catalog arrays, which are always seeded non-empty on a fresh state", () => {
    // ensureCatalogDefaults populates these on every load regardless of user
    // action, so their presence alone must never count as "customized" —
    // otherwise every fresh workspace would look customized.
    expect(
      workspaceHasCustomSettings({
        ...DEFAULT_SETTINGS,
        personnelGroups: [{ id: "postdoc", label: "Postdoc" } as never],
        fundingSourceTypes: [{ id: "grant", label: "Grant" } as never],
        accountGroups: [{ id: "core", label: "Core" } as never],
      })
    ).toBe(false);
  });
});

describe("toCloudWorkspacePayload", () => {
  it("copies planning state and stamps updatedAt", () => {
    const payload = toCloudWorkspacePayload(
      local({ snapshot: { id: "s1" } as StoredAppState["snapshot"] }),
      "2026-08-19T12:00:00.000Z"
    );
    expect(payload.version).toBe(1);
    expect(payload.updatedAt).toBe("2026-08-19T12:00:00.000Z");
    expect(payload.snapshot?.id).toBe("s1");
  });
});

describe("planned personnel records", () => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    plannedHires: [
      {
        id: "p1",
        displayName: "Postdoc (TBD)",
        role: "Postdoctoral scholar",
        startMonth: "2026-09",
        appointmentPercent: 100,
        annualSalary: 72000,
        benefitsRatePct: 32,
        createdAt: "2026-06-18T00:00:00.000Z",
        createdBy: "pi@ucsf.edu",
      },
    ],
    personLinks: [
      {
        id: "l1",
        plannedHireId: "p1",
        employeePersonKey: "hr:02987654",
        basis: "suggested",
        signals: ["newInReport", "startWindow", "sharedAccount"],
        linkedAt: "2026-09-16T17:00:00.000Z",
        linkedBy: "pi@ucsf.edu",
      },
    ],
    reconciliationChoices: [
      {
        linkId: "l1",
        forecastRate: "planned",
        pinPlannedRate: false,
        distribution: "plan",
        effectiveFrom: "2026-10",
        decidedAt: "2026-09-16T17:00:00.000Z",
        decidedBy: "pi@ucsf.edu",
      },
    ],
    matchDismissals: [
      { plannedHireId: "p2", employeePersonKey: "hr:1", at: "2026-09-16T17:01:00.000Z", by: "pi@ucsf.edu" },
    ],
    reconciliationEvents: [
      {
        id: "e1",
        at: "2026-09-16T17:00:00.000Z",
        by: "pi@ucsf.edu",
        type: "link",
        summary: "Linked Postdoc (TBD) to Ana Ruiz",
        linkId: "l1",
        plannedHireId: "p1",
      },
    ],
  };

  it("round-trip through the cloud workspace JSON unchanged", () => {
    const state = local({ snapshot: { id: "s1" } as StoredAppState["snapshot"], settings });
    const payload = toCloudWorkspacePayload(state, "2026-09-16T18:00:00.000Z");
    const stored = cloudWorkspaceToStored(JSON.parse(JSON.stringify(payload)));
    expect(stored.settings.plannedHires).toEqual(settings.plannedHires);
    expect(stored.settings.personLinks).toEqual(settings.personLinks);
    expect(stored.settings.reconciliationChoices).toEqual(settings.reconciliationChoices);
    expect(stored.settings.matchDismissals).toEqual(settings.matchDismissals);
    expect(stored.settings.reconciliationEvents).toEqual(settings.reconciliationEvents);

    const picked = pickWorkspace(local(), payload);
    expect(picked.settings.personLinks).toEqual(settings.personLinks);
  });

  it("default to empty for workspaces saved before the records existed", () => {
    const legacy = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).filter(
        ([key]) =>
          ![
            "plannedHires",
            "personLinks",
            "reconciliationChoices",
            "matchDismissals",
            "reconciliationEvents",
          ].includes(key)
      )
    ) as AppSettings;
    const stored = cloudWorkspaceToStored(
      cloud({ snapshot: { id: "s1" } as CloudWorkspacePayload["snapshot"], settings: legacy })
    );
    expect(stored.settings.plannedHires).toEqual([]);
    expect(stored.settings.personLinks).toEqual([]);
    expect(stored.settings.reconciliationChoices).toEqual([]);
    expect(stored.settings.matchDismissals).toEqual([]);
    expect(stored.settings.reconciliationEvents).toEqual([]);
  });
});
