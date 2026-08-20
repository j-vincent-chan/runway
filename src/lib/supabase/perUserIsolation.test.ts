import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceStoragePath } from "@/lib/supabase/workspace";
import {
  localStorageKey,
  loadStateForAccount,
  saveState,
  clearState,
  purgeMigratedLocalStorageKeys,
  listLocalStoragePlanningWorkspaces,
} from "@/lib/storage/localStorage";
import { DEFAULT_SETTINGS } from "@/types";
import { coerceCloudWorkspacePayload } from "@/lib/supabase/workspace";

describe("per-user workspace paths", () => {
  it("scopes storage path to user id", () => {
    expect(workspaceStoragePath("abc-123")).toBe("abc-123/workspace.json");
  });

  it("scopes browser key to user or local slot", () => {
    expect(localStorageKey(null)).toBe("payroll-funding-planner:local");
    expect(localStorageKey("abc-123")).toBe("payroll-funding-planner:user:abc-123");
  });
});

describe("coerceCloudWorkspacePayload", () => {
  it("accepts versioned payloads", () => {
    const payload = coerceCloudWorkspacePayload({
      version: 1,
      updatedAt: "2026-08-01T00:00:00.000Z",
      snapshot: { id: "s1", employees: [] },
      workingPlan: null,
      scenarios: [],
      settings: DEFAULT_SETTINGS,
      portfolioImports: [],
    });
    expect(payload?.snapshot?.id).toBe("s1");
  });

  it("accepts legacy browser-shaped JSON without version", () => {
    const payload = coerceCloudWorkspacePayload({
      snapshot: { id: "legacy", employees: [{ id: "e1" }] },
      workingPlan: null,
      scenarios: [],
      settings: DEFAULT_SETTINGS,
      portfolioImports: [],
      savedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(payload?.version).toBe(1);
    expect(payload?.snapshot?.id).toBe("legacy");
  });
});

describe("loadStateForAccount", () => {
  const memory = new Map<string, unknown>();

  beforeEach(() => {
    memory.clear();
    const lsStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() {
        return lsStore.size;
      },
      key: (i: number) => [...lsStore.keys()][i] ?? null,
      getItem: (key: string) => lsStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        lsStore.set(key, value);
      },
      removeItem: (key: string) => {
        lsStore.delete(key);
      },
    });
    vi.stubGlobal("window", globalThis);

    const fakeDb = {
      objectStoreNames: { contains: () => true },
      close: () => undefined,
      transaction: (_store: string, _mode: string) => {
        const store = {
          get: (id: string) => {
            const req: { result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => {
              req.result = memory.get(id);
              req.onsuccess?.();
            });
            return req;
          },
          getAll: () => {
            const req: { result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => {
              req.result = [...memory.values()];
              req.onsuccess?.();
            });
            return req;
          },
          put: (row: { id: string }) => {
            memory.set(row.id, row);
          },
          delete: (id: string) => {
            memory.delete(id);
          },
        };
        const tx: {
          objectStore: () => typeof store;
          oncomplete: (() => void) | null;
          onerror: (() => void) | null;
          error: null;
        } = {
          objectStore: () => store,
          oncomplete: null,
          onerror: null,
          error: null,
        };
        queueMicrotask(() => tx.oncomplete?.());
        return tx;
      },
    };

    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: {
          result: typeof fakeDb;
          error: null;
          onsuccess: (() => void) | null;
          onerror: (() => void) | null;
          onupgradeneeded: (() => void) | null;
        } = {
          result: fakeDb,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    });
  });

  it("promotes shared local data only for the lab owner", async () => {
    await clearState(null);
    await clearState("owner-id");
    await clearState("other-id");
    await saveState(
      {
        snapshot: { id: "lab", employees: [{ id: "e1" }] } as never,
        workingPlan: null,
        scenarios: [],
        settings: DEFAULT_SETTINGS,
        portfolioImports: [],
      },
      null
    );

    const other = await loadStateForAccount("other-id", "colleague@ucsf.edu");
    expect(other.snapshot).toBeNull();

    const owner = await loadStateForAccount("owner-id", "vincent.chan@ucsf.edu");
    expect(owner.snapshot?.id).toBe("lab");
    expect((await loadStateForAccount(null, null)).snapshot).toBeNull();
  });

  it("purgeMigratedLocalStorageKeys only removes listed keys", () => {
    localStorage.setItem("payroll-funding-planner:local", "{}");
    localStorage.setItem("payroll-funding-planner:user:keep", "{}");
    localStorage.setItem("other", "1");
    purgeMigratedLocalStorageKeys(["payroll-funding-planner:local"]);
    expect(localStorage.getItem("payroll-funding-planner:local")).toBeNull();
    expect(localStorage.getItem("payroll-funding-planner:user:keep")).toBe("{}");
    expect(localStorage.getItem("other")).toBe("1");
  });

  it("lists localStorage planning workspaces", () => {
    localStorage.setItem(
      "payroll-funding-planner:local",
      JSON.stringify({
        snapshot: { id: "x", employees: [] },
        workingPlan: null,
        scenarios: [],
        settings: DEFAULT_SETTINGS,
        portfolioImports: [],
      })
    );
    expect(listLocalStoragePlanningWorkspaces()[0]?.state.snapshot?.id).toBe("x");
  });
});
