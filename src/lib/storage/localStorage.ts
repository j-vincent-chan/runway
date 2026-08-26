import type {
  AppSettings,
  NetPositionReportImport,
  PayrollReportImport,
  PayrollReportSnapshot,
  Scenario,
  WorkingPlan,
  PositionSalaryReportImport,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { ensureCatalogDefaults } from "@/lib/supabase/catalog";
import { isLabOwnerEmail } from "@/lib/supabase/labOwner";

const BASE_KEY = "payroll-funding-planner";
const DB_NAME = "runway-workspace";
const STORE = "workspaces";
const DB_VERSION = 1;

/** Per-user browser store when signed in; shared local-only key when signed out. */
export function localStorageKey(userId?: string | null): string {
  return userId ? `${BASE_KEY}:user:${userId}` : `${BASE_KEY}:local`;
}

export interface StoredAppState {
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  scenarios: Scenario[];
  settings: AppSettings;
  payrollImports?: PayrollReportImport[];
  netPositionImports?: NetPositionReportImport[];
  positionSalaryImports?: PositionSalaryReportImport[];
  /** ISO timestamp of last local save — used to reconcile with Supabase */
  savedAt?: string;
}

type StoredRow = StoredAppState & { id: string };

function emptyState(): StoredAppState {
  return {
    snapshot: null,
    workingPlan: null,
    scenarios: [],
    settings: ensureCatalogDefaults(DEFAULT_SETTINGS),
    payrollImports: [],
    netPositionImports: [],
    positionSalaryImports: [],
  };
}

function normalizeState(parsed: Partial<StoredAppState> | null | undefined): StoredAppState {
  if (!parsed) return emptyState();
  return {
    snapshot: parsed.snapshot ?? null,
    workingPlan: parsed.workingPlan ?? null,
    scenarios: parsed.scenarios ?? [],
    settings: ensureCatalogDefaults({ ...DEFAULT_SETTINGS, ...parsed.settings }),
    payrollImports: parsed.payrollImports ?? [],
    netPositionImports: parsed.netPositionImports ?? [],
    positionSalaryImports: parsed.positionSalaryImports ?? [],
    savedAt: parsed.savedAt,
  };
}

function parseStored(raw: string | null): StoredAppState {
  if (!raw) return emptyState();
  try {
    return normalizeState(JSON.parse(raw) as StoredAppState);
  } catch {
    return emptyState();
  }
}

export function hasPlanningData(state: StoredAppState): boolean {
  return Boolean(
    state.snapshot ||
      state.workingPlan ||
      (state.payrollImports && state.payrollImports.length > 0) ||
      (state.netPositionImports && state.netPositionImports.length > 0) ||
      (state.positionSalaryImports && state.positionSalaryImports.length > 0)
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

async function idbGet(id: string): Promise<StoredAppState | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        db.close();
        const row = req.result as StoredRow | undefined;
        if (!row) {
          resolve(null);
          return;
        }
        const { id: _id, ...rest } = row;
        resolve(normalizeState(rest));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn("[workspace] IndexedDB read failed:", err);
    return null;
  }
}

async function idbPut(id: string, state: StoredAppState): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).put({ ...state, id } satisfies StoredRow);
  });
}

async function idbDelete(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.objectStore(STORE).delete(id);
    });
  } catch (err) {
    console.warn("[workspace] IndexedDB delete failed:", err);
  }
}

/** All IndexedDB workspace rows that still hold planning data. */
export async function listPlanningWorkspaces(): Promise<
  Array<{ id: string; state: StoredAppState }>
> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        db.close();
        const rows = (req.result as StoredRow[] | undefined) ?? [];
        resolve(
          rows
            .map((row) => {
              const { id, ...rest } = row;
              return { id, state: normalizeState(rest) };
            })
            .filter((entry) => hasPlanningData(entry.state))
        );
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn("[workspace] IndexedDB list failed:", err);
    return [];
  }
}

/** Remove only the given localStorage key — never wipe sibling slots. */
function removeLocalStorageKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Drop legacy root key + optional known slots after a successful IndexedDB write. */
export function purgeMigratedLocalStorageKeys(keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    removeLocalStorageKey(BASE_KEY);
    for (const key of keys) removeLocalStorageKey(key);
  } catch {
    /* ignore */
  }
}

function readLocalStorageSlot(userId?: string | null): StoredAppState {
  if (typeof window === "undefined") return emptyState();
  const key = localStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return parseStored(raw);
    if (!userId) {
      const legacy = localStorage.getItem(BASE_KEY);
      if (legacy) return parseStored(legacy);
    }
  } catch {
    /* ignore */
  }
  return emptyState();
}

/** Scan localStorage for any runway workspace that still has planning data. */
export function listLocalStoragePlanningWorkspaces(): Array<{
  id: string;
  state: StoredAppState;
}> {
  if (typeof window === "undefined") return [];
  const out: Array<{ id: string; state: StoredAppState }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || (key !== BASE_KEY && !key.startsWith(`${BASE_KEY}:`))) continue;
      const state = parseStored(localStorage.getItem(key));
      if (hasPlanningData(state)) out.push({ id: key, state });
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Sync read of localStorage only (tests / rare callers).
 * Prefer {@link loadStateAsync} in the app — planning data lives in IndexedDB.
 */
export function loadState(userId?: string | null): StoredAppState {
  return readLocalStorageSlot(userId);
}

/**
 * Load planning state for the given user (or unsigned local slot).
 * Prefers IndexedDB; migrates that slot from localStorage once then clears only that key.
 */
export async function loadStateAsync(userId?: string | null): Promise<StoredAppState> {
  if (typeof window === "undefined") return emptyState();
  const id = localStorageKey(userId);
  const fromIdb = await idbGet(id);
  if (fromIdb && hasPlanningData(fromIdb)) return fromIdb;

  const fromLs = readLocalStorageSlot(userId);
  if (hasPlanningData(fromLs)) {
    try {
      await idbPut(id, fromLs);
      purgeMigratedLocalStorageKeys([id, ...(userId ? [] : [BASE_KEY])]);
    } catch (err) {
      console.warn("[workspace] migrate to IndexedDB failed:", err);
    }
    return fromLs;
  }

  return fromIdb ?? emptyState();
}

function pickRichest(candidates: StoredAppState[]): StoredAppState | null {
  let best: StoredAppState | null = null;
  let bestScore = -1;
  for (const state of candidates) {
    if (!hasPlanningData(state)) continue;
    const score =
      (state.snapshot?.employees?.length ?? 0) * 1000 +
      (state.payrollImports?.length ?? 0) * 10 +
      (state.netPositionImports?.length ?? 0) +
      (state.positionSalaryImports?.length ?? 0) +
      (state.savedAt ? Date.parse(state.savedAt) / 1e13 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = state;
    }
  }
  return best;
}

/**
 * One-time: lab owner inherits the pre-auth browser dataset (and any orphaned slots).
 * Other signed-in accounts keep an empty private slot.
 */
export async function loadStateForAccount(
  userId: string | null | undefined,
  email: string | null | undefined
): Promise<StoredAppState> {
  if (!userId) return loadStateAsync(null);

  const own = await loadStateAsync(userId);
  if (hasPlanningData(own) || !isLabOwnerEmail(email)) {
    return own;
  }

  const shared = await loadStateAsync(null);
  const idbOrphans = await listPlanningWorkspaces();
  const lsOrphans = listLocalStoragePlanningWorkspaces();
  const recovered = pickRichest([
    shared,
    ...idbOrphans.map((e) => e.state),
    ...lsOrphans.map((e) => e.state),
  ]);

  if (!recovered) return own;

  await saveState(recovered, userId);
  // Clear unsigned slot only; leave other users' keys alone.
  await clearState(null);
  purgeMigratedLocalStorageKeys([localStorageKey(null), BASE_KEY]);
  return recovered;
}

export async function saveState(state: StoredAppState, userId?: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  const savedAt = state.savedAt ?? new Date().toISOString();
  const next = { ...state, savedAt };
  const id = localStorageKey(userId);
  try {
    await idbPut(id, next);
    // Only drop the matching localStorage key after a successful IDB write.
    // Never wipe sibling keys — that deleted the lab dataset after empty logins.
    if (hasPlanningData(next)) {
      purgeMigratedLocalStorageKeys([id]);
    }
  } catch (err) {
    console.warn("[workspace] IndexedDB save failed, trying localStorage:", err);
    try {
      localStorage.setItem(id, JSON.stringify(next));
    } catch (lsErr) {
      console.warn("[workspace] browser save skipped (quota or unavailable):", lsErr);
    }
  }
}

export async function clearState(userId?: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  const id = localStorageKey(userId);
  await idbDelete(id);
  removeLocalStorageKey(id);
  if (!userId) removeLocalStorageKey(BASE_KEY);
}
