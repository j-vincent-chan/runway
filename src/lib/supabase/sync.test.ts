import { describe, expect, it } from "vitest";
import { mergeRemoteSettings } from "@/lib/supabase/sync";
import {
  DEFAULT_SETTINGS,
  type MatchDismissal,
  type PersonLink,
  type PlannedFundingSource,
  type PlannedHire,
  type ProjectionRule,
  type ReconciliationChoice,
} from "@/types";

function plannedHire(overrides: Partial<PlannedHire> = {}): PlannedHire {
  return {
    id: "p1",
    displayName: "Postdoc (TBD)",
    startMonth: "2026-09",
    appointmentPercent: 100,
    annualSalary: 72000,
    benefitsRatePct: 32,
    createdAt: "2026-06-18T00:00:00.000Z",
    createdBy: "pi@ucsf.edu",
    ...overrides,
  };
}

function personLink(overrides: Partial<PersonLink> = {}): PersonLink {
  return {
    id: "l1",
    plannedHireId: "p1",
    employeePersonKey: "hr:02987654",
    basis: "suggested",
    signals: ["newInReport"],
    linkedAt: "2026-09-16T17:00:00.000Z",
    linkedBy: "pi@ucsf.edu",
    ...overrides,
  };
}

function reconciliationChoice(overrides: Partial<ReconciliationChoice> = {}): ReconciliationChoice {
  return {
    linkId: "l1",
    forecastRate: "planned",
    pinPlannedRate: false,
    distribution: "plan",
    effectiveFrom: "2026-10",
    decidedAt: "2026-09-16T17:00:00.000Z",
    decidedBy: "pi@ucsf.edu",
    ...overrides,
  };
}

function matchDismissal(overrides: Partial<MatchDismissal> = {}): MatchDismissal {
  return {
    plannedHireId: "p2",
    employeePersonKey: "hr:1",
    at: "2026-09-16T17:01:00.000Z",
    by: "pi@ucsf.edu",
    ...overrides,
  };
}

function projectionRule(overrides: Partial<ProjectionRule> = {}): ProjectionRule {
  return {
    id: "r1",
    personKey: "hr:02987654",
    trigger: { type: "onDate", month: "2026-12" },
    remainder: { kind: "uncovered" },
    ...overrides,
  };
}

function plannedFundingSource(overrides: Partial<PlannedFundingSource> = {}): PlannedFundingSource {
  return {
    id: "pf1",
    chartstringKey: "planned:pf1",
    alias: "New Grant",
    color: "#a3c4e8",
    ...overrides,
  };
}

describe("mergeRemoteSettings", () => {
  it("merges remote account group and funding source category assignments additively", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      accountGroupByBalanceKey: { "acct-1": "core" },
      fundingSourceCategories: { "fund-1": "grant" },
    };
    const merged = mergeRemoteSettings(
      local,
      {},
      [],
      [],
      { "acct-2": "not-mine" },
      { "fund-2": "training" }
    );
    expect(merged.accountGroupByBalanceKey).toEqual({ "acct-1": "core", "acct-2": "not-mine" });
    expect(merged.fundingSourceCategories).toEqual({ "fund-1": "grant", "fund-2": "training" });
  });

  it("lets a remote value overwrite a matching local key (remote wins on conflict)", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      accountGroupByBalanceKey: { "acct-1": "core" },
    };
    const merged = mergeRemoteSettings(local, {}, [], [], { "acct-1": "not-mine" }, undefined);
    expect(merged.accountGroupByBalanceKey).toEqual({ "acct-1": "not-mine" });
  });

  it("tolerates missing remote maps", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      accountGroupByBalanceKey: { "acct-1": "core" },
      fundingSourceCategories: { "fund-1": "grant" },
    };
    const merged = mergeRemoteSettings(local, {}, [], []);
    expect(merged.accountGroupByBalanceKey).toEqual({ "acct-1": "core" });
    expect(merged.fundingSourceCategories).toEqual({ "fund-1": "grant" });
  });

  it("unions planned hires by id, keeping a local-only entry not yet on the remote", () => {
    const local = { ...DEFAULT_SETTINGS, plannedHires: [plannedHire({ id: "local-only" })] };
    const merged = mergeRemoteSettings(local, {}, [], [], undefined, undefined, [
      plannedHire({ id: "remote-only" }),
    ]);
    expect(merged.plannedHires?.map((p) => p.id).sort()).toEqual(["local-only", "remote-only"]);
  });

  it("lets the remote copy of a planned hire win over a stale local one", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      plannedHires: [plannedHire({ id: "p1", displayName: "Old name" })],
    };
    const merged = mergeRemoteSettings(local, {}, [], [], undefined, undefined, [
      plannedHire({ id: "p1", displayName: "New name" }),
    ]);
    expect(merged.plannedHires).toEqual([plannedHire({ id: "p1", displayName: "New name" })]);
  });

  it("unions person links by id, keeping a local-only link not yet on the remote", () => {
    const local = { ...DEFAULT_SETTINGS, personLinks: [personLink({ id: "local-only" })] };
    const merged = mergeRemoteSettings(local, {}, [], [], undefined, undefined, undefined, [
      personLink({ id: "remote-only" }),
    ]);
    expect(merged.personLinks?.map((l) => l.id).sort()).toEqual(["local-only", "remote-only"]);
  });

  it("lets the remote copy of a reversed link win over a stale local one", () => {
    const local = { ...DEFAULT_SETTINGS, personLinks: [personLink({ id: "l1" })] };
    const reversed = personLink({ id: "l1", reversedAt: "2026-09-20T00:00:00.000Z", reversedBy: "pi@ucsf.edu" });
    const merged = mergeRemoteSettings(local, {}, [], [], undefined, undefined, undefined, [reversed]);
    expect(merged.personLinks).toEqual([reversed]);
  });

  it("unions reconciliation choices by linkId, remote winning on conflict", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      reconciliationChoices: [reconciliationChoice({ linkId: "local-only" })],
    };
    const merged = mergeRemoteSettings(
      local,
      {},
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      [reconciliationChoice({ linkId: "l1", pinPlannedRate: true })]
    );
    expect(merged.reconciliationChoices?.map((c) => c.linkId).sort()).toEqual(["l1", "local-only"]);
    expect(merged.reconciliationChoices?.find((c) => c.linkId === "l1")?.pinPlannedRate).toBe(true);
  });

  it("unions match dismissals by the plannedHireId+employeePersonKey pair", () => {
    const local = { ...DEFAULT_SETTINGS, matchDismissals: [matchDismissal({ plannedHireId: "local-only" })] };
    const merged = mergeRemoteSettings(
      local,
      {},
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [matchDismissal({ plannedHireId: "remote-only" })]
    );
    expect(merged.matchDismissals?.map((d) => d.plannedHireId).sort()).toEqual([
      "local-only",
      "remote-only",
    ]);
  });

  it("unions projection rules by id and planned funding sources by id", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      projectionRules: [projectionRule({ id: "local-only" })],
      plannedFundingSources: [plannedFundingSource({ id: "local-only" })],
    };
    const merged = mergeRemoteSettings(
      local,
      {},
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [projectionRule({ id: "remote-only" })],
      [plannedFundingSource({ id: "remote-only" })]
    );
    expect(merged.projectionRules?.map((r) => r.id).sort()).toEqual(["local-only", "remote-only"]);
    expect(merged.plannedFundingSources?.map((p) => p.id).sort()).toEqual([
      "local-only",
      "remote-only",
    ]);
  });

  it("prefers the remote projection horizon when present, keeps local otherwise", () => {
    const local = { ...DEFAULT_SETTINGS, projectionHorizon: { preset: "12" as const } };
    const withRemote = mergeRemoteSettings(
      local,
      {},
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { preset: "6" }
    );
    expect(withRemote.projectionHorizon).toEqual({ preset: "6" });

    const withoutRemote = mergeRemoteSettings(local, {}, [], []);
    expect(withoutRemote.projectionHorizon).toEqual({ preset: "12" });
  });
});
