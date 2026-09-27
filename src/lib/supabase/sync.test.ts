import { describe, expect, it } from "vitest";
import { mergeRemoteSettings } from "@/lib/supabase/sync";
import { DEFAULT_SETTINGS, type PlannedHire } from "@/types";

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
});
