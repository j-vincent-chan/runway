import { afterEach, describe, expect, it } from "vitest";
import {
  getActiveWorkspaceOverride,
  getActiveWorkspaceOwnerId,
  setActiveWorkspaceOverride,
} from "@/lib/supabase/activeWorkspace";

describe("active workspace override", () => {
  afterEach(() => setActiveWorkspaceOverride(null));

  it("falls back to the signed-in user when no override is set", async () => {
    // Unconfigured Supabase in the test env ⇒ no auth user ⇒ null, same as
    // getCurrentUserId(). The point is the absence of any override leakage.
    expect(getActiveWorkspaceOverride()).toBeNull();
    expect(await getActiveWorkspaceOwnerId()).toBeNull();
  });

  it("targets the delegated PI while an override is set, then releases it", async () => {
    setActiveWorkspaceOverride({ userId: "pi-1", email: "pi@ucsf.edu" });
    expect(await getActiveWorkspaceOwnerId()).toBe("pi-1");
    expect(getActiveWorkspaceOverride()?.email).toBe("pi@ucsf.edu");

    setActiveWorkspaceOverride(null);
    expect(await getActiveWorkspaceOwnerId()).toBeNull();
  });
});
