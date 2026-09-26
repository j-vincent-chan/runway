import { describe, expect, it } from "vitest";
import { resolveWorkspaceSelection, SELF_SELECTION } from "./selection";
import type { DelegationGrant } from "@/lib/supabase/delegates";

function grant(piUserId: string): DelegationGrant {
  return {
    piUserId,
    piEmail: `${piUserId}@ucsf.edu`,
    analystEmail: "analyst@ucsf.edu",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveWorkspaceSelection", () => {
  it("auto-picks the sole grant for a pure analyst with nothing persisted", () => {
    const tina = grant("tina");
    const resolved = resolveWorkspaceSelection(null, [tina], "analyst");
    expect(resolved).toEqual({ grant: tina, chosen: true, persist: "tina" });
  });

  it("does not auto-pick for a PI role even with exactly one grant", () => {
    const resolved = resolveWorkspaceSelection(null, [grant("tina")], "pi");
    expect(resolved).toEqual({ grant: null, chosen: false, persist: null });
  });

  it("does not auto-pick when there are multiple grants and nothing persisted", () => {
    const resolved = resolveWorkspaceSelection(null, [grant("tina"), grant("amy")], "analyst");
    expect(resolved).toEqual({ grant: null, chosen: false, persist: null });
  });

  it("honors an explicit self selection for a hybrid PI/analyst account", () => {
    // This is the reported bug: a PI who is also a delegated analyst with one
    // grant must be able to return to, and stay on, their own workspace.
    const resolved = resolveWorkspaceSelection(SELF_SELECTION, [grant("tina")], "analyst");
    expect(resolved).toEqual({ grant: null, chosen: true, persist: SELF_SELECTION });
  });

  it("honors a persisted grant that still exists", () => {
    const tina = grant("tina");
    const amy = grant("amy");
    const resolved = resolveWorkspaceSelection("amy", [tina, amy], "analyst");
    expect(resolved).toEqual({ grant: amy, chosen: true, persist: "amy" });
  });

  it("falls back to unset when the persisted grant was revoked, and re-evaluates auto-pick", () => {
    const remaining = grant("amy");
    const resolved = resolveWorkspaceSelection("tina", [remaining], "analyst");
    expect(resolved).toEqual({ grant: remaining, chosen: true, persist: "amy" });
  });

  it("falls back to fully unset when the persisted grant was revoked and none remain", () => {
    const resolved = resolveWorkspaceSelection("tina", [], "analyst");
    expect(resolved).toEqual({ grant: null, chosen: false, persist: null });
  });
});
