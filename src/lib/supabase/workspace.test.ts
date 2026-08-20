import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/types";
import type { StoredAppState } from "@/lib/storage/localStorage";
import {
  pickWorkspace,
  toCloudWorkspacePayload,
  type CloudWorkspacePayload,
} from "@/lib/supabase/workspace";

function local(partial: Partial<StoredAppState> = {}): StoredAppState {
  return {
    snapshot: null,
    workingPlan: null,
    scenarios: [],
    settings: DEFAULT_SETTINGS,
    portfolioImports: [],
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
    portfolioImports: [],
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
