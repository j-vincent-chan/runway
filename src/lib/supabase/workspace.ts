import type { StoredAppState } from "@/lib/storage/localStorage";
import { DEFAULT_SETTINGS } from "@/types";
import type {
  AppSettings,
  NetPositionReportImport,
  PayrollReportImport,
  PayrollReportSnapshot,
  PositionSalaryReportImport,
  Scenario,
  WorkingPlan,
} from "@/types";
import { getCurrentUserId } from "@/lib/supabase/authUser";
import { getSupabase } from "@/lib/supabase/client";
import { ensureCatalogDefaults } from "@/lib/supabase/catalog";
import { ensurePayrollImports } from "@/lib/import/foldPayrollImports";
import { isLabOwnerEmail } from "@/lib/supabase/labOwner";

export const WORKSPACE_STORAGE_BUCKET = "app-workspace";
/** Pre-auth shared lab files — claimed once by the lab owner account. */
export const LEGACY_WORKSPACE_STORAGE_PATHS = ["default.json", "workspace.json"] as const;
/** @deprecated use LEGACY_WORKSPACE_STORAGE_PATHS */
export const LEGACY_WORKSPACE_STORAGE_PATH = LEGACY_WORKSPACE_STORAGE_PATHS[0];

export function workspaceStoragePath(userId: string): string {
  return `${userId}/workspace.json`;
}

export type CloudWorkspacePayload = {
  version: 1;
  updatedAt: string;
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  scenarios: Scenario[];
  settings: AppSettings;
  payrollImports?: PayrollReportImport[];
  netPositionImports?: NetPositionReportImport[];
  positionSalaryImports?: PositionSalaryReportImport[];
};

export function workspaceHasPlanningData(state: {
  snapshot?: PayrollReportSnapshot | null;
  workingPlan?: WorkingPlan | null;
  payrollImports?: PayrollReportImport[];
  netPositionImports?: NetPositionReportImport[];
  positionSalaryImports?: PositionSalaryReportImport[];
}): boolean {
  return Boolean(
    state.snapshot ||
      state.workingPlan ||
      (state.payrollImports && state.payrollImports.length > 0) ||
      (state.netPositionImports && state.netPositionImports.length > 0) ||
      (state.positionSalaryImports && state.positionSalaryImports.length > 0)
  );
}

export function toCloudWorkspacePayload(
  state: StoredAppState,
  updatedAt: string
): CloudWorkspacePayload {
  return {
    version: 1,
    updatedAt,
    snapshot: state.snapshot,
    workingPlan: state.workingPlan,
    scenarios: state.scenarios ?? [],
    settings: state.settings,
    payrollImports: ensurePayrollImports(state.snapshot, state.payrollImports),
    netPositionImports: state.netPositionImports ?? [],
    positionSalaryImports: state.positionSalaryImports ?? [],
  };
}

export function cloudWorkspaceToStored(
  cloud: CloudWorkspacePayload
): StoredAppState {
  const snapshot = cloud.snapshot ?? null;
  return {
    snapshot,
    workingPlan: cloud.workingPlan ?? null,
    scenarios: cloud.scenarios ?? [],
    settings: ensureCatalogDefaults({ ...DEFAULT_SETTINGS, ...cloud.settings }),
    payrollImports: ensurePayrollImports(snapshot, cloud.payrollImports),
    netPositionImports: cloud.netPositionImports ?? [],
    positionSalaryImports: cloud.positionSalaryImports ?? [],
    savedAt: cloud.updatedAt,
  };
}

/**
 * Prefer cloud when it has planning data and is at least as new as local.
 * Prefer local when it was saved later (offline edits) or cloud is empty.
 */
export function pickWorkspace(
  local: StoredAppState,
  cloud: CloudWorkspacePayload | null
): StoredAppState {
  if (!cloud) return local;
  const cloudState = cloudWorkspaceToStored(cloud);
  const localHas = workspaceHasPlanningData(local);
  const cloudHas = workspaceHasPlanningData(cloud);
  if (cloudHas && !localHas) return cloudState;
  if (!cloudHas) return local;
  const localAt = local.savedAt ?? "";
  const cloudAt = cloud.updatedAt ?? "";
  if (!localAt || cloudAt >= localAt) return cloudState;
  return local;
}

function isCloudWorkspacePayload(value: unknown): value is CloudWorkspacePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as CloudWorkspacePayload;
  return v.version === 1 && typeof v.updatedAt === "string";
}

/** Accept versioned cloud payloads and older browser-shaped JSON. */
export function coerceCloudWorkspacePayload(
  value: unknown
): CloudWorkspacePayload | null {
  if (!value || typeof value !== "object") return null;
  if (isCloudWorkspacePayload(value)) return value;

  const raw = value as Partial<StoredAppState> & { updatedAt?: string };
  const looksLikeWorkspace =
    "snapshot" in raw ||
    "workingPlan" in raw ||
    "settings" in raw ||
    // Older payloads carried MyPortfolio imports; still recognizable as a
    // workspace, but the rows themselves are no longer read back.
    "portfolioImports" in raw ||
    "payrollImports" in raw ||
    "netPositionImports" in raw ||
    "positionSalaryImports" in raw;
  if (!looksLikeWorkspace) return null;

  const stored: StoredAppState = {
    snapshot: (raw.snapshot as PayrollReportSnapshot | null | undefined) ?? null,
    workingPlan: (raw.workingPlan as WorkingPlan | null | undefined) ?? null,
    scenarios: (raw.scenarios as Scenario[] | undefined) ?? [],
    settings: ensureCatalogDefaults({
      ...DEFAULT_SETTINGS,
      ...((raw.settings as AppSettings | undefined) ?? {}),
    }),
    payrollImports: raw.payrollImports as PayrollReportImport[] | undefined,
    netPositionImports:
      (raw.netPositionImports as NetPositionReportImport[] | undefined) ?? [],
    positionSalaryImports:
      (raw.positionSalaryImports as PositionSalaryReportImport[] | undefined) ?? [],
    savedAt: raw.savedAt ?? raw.updatedAt,
  };

  if (!workspaceHasPlanningData(stored)) return null;
  return toCloudWorkspacePayload(
    stored,
    stored.savedAt ?? new Date().toISOString()
  );
}

async function parseWorkspaceBlob(data: Blob): Promise<CloudWorkspacePayload | null> {
  try {
    const parsed: unknown = JSON.parse(await data.text());
    const coerced = coerceCloudWorkspacePayload(parsed);
    if (!coerced) {
      console.warn("[supabase] workspace file is not a recognized payload");
      return null;
    }
    return coerced;
  } catch (err) {
    console.warn("[supabase] workspace JSON parse failed:", err);
    return null;
  }
}

export async function fetchCloudWorkspace(): Promise<CloudWorkspacePayload | null> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase.storage
    .from(WORKSPACE_STORAGE_BUCKET)
    .download(workspaceStoragePath(userId));

  if (error || !data) {
    const message = error?.message ?? "";
    if (!/not found|does not exist/i.test(message)) {
      console.warn("[supabase] fetch workspace failed:", message || "no data");
    }
    return null;
  }

  return parseWorkspaceBlob(data);
}

/**
 * Lab owner only: copy a root-level legacy workspace file into `{userId}/workspace.json`.
 * Tries `default.json` then root `workspace.json` (common when Storage UI shows only that file).
 * Requires schema RLS that allows the owner email to read/delete those root objects.
 */
export async function claimLegacyCloudWorkspace(
  email: string | null | undefined
): Promise<CloudWorkspacePayload | null> {
  if (!isLabOwnerEmail(email)) return null;

  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return null;

  const existing = await fetchCloudWorkspace();
  if (existing && workspaceHasPlanningData(existing)) return existing;

  let legacy: CloudWorkspacePayload | null = null;
  let claimedFrom: string | null = null;

  for (const path of LEGACY_WORKSPACE_STORAGE_PATHS) {
    const { data, error } = await supabase.storage
      .from(WORKSPACE_STORAGE_BUCKET)
      .download(path);

    if (error || !data) {
      console.warn(
        `[supabase] legacy claim miss for ${path}:`,
        error?.message ?? "not found"
      );
      continue;
    }

    const parsed = await parseWorkspaceBlob(data);
    if (parsed && workspaceHasPlanningData(parsed)) {
      legacy = parsed;
      claimedFrom = path;
      break;
    }
    console.warn(`[supabase] ${path} had no planning data`);
  }

  if (!legacy || !claimedFrom) {
    console.warn(
      "[supabase] no claimable root workspace (default.json / workspace.json) — check Storage path is {userId}/workspace.json"
    );
    return null;
  }

  const dest = workspaceStoragePath(userId);
  // If the "legacy" file is already our destination, nothing to copy.
  if (claimedFrom === dest) return legacy;

  const blob = new Blob([JSON.stringify(legacy)], { type: "application/json" });
  const { error: uploadError } = await supabase.storage
    .from(WORKSPACE_STORAGE_BUCKET)
    .upload(dest, blob, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });

  if (uploadError) {
    console.warn("[supabase] legacy workspace upload failed:", uploadError.message);
    return null;
  }

  const { error: rowError } = await supabase.from("app_workspace").upsert(
    {
      user_id: userId,
      updated_at: legacy.updatedAt ?? new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (rowError) {
    console.warn("[supabase] legacy workspace metadata failed:", rowError.message);
  }

  const { error: removeError } = await supabase.storage
    .from(WORKSPACE_STORAGE_BUCKET)
    .remove([claimedFrom]);
  if (removeError) {
    console.warn(`[supabase] could not remove legacy ${claimedFrom}:`, removeError.message);
  }

  return legacy;
}

export async function saveCloudWorkspace(state: StoredAppState): Promise<string | null> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return null;

  // Never push an empty workspace over a cloud copy that still has lab data.
  if (!workspaceHasPlanningData(state)) {
    const existing = await fetchCloudWorkspace();
    if (existing && workspaceHasPlanningData(existing)) {
      console.warn("[supabase] skip empty cloud save — existing workspace has data");
      return existing.updatedAt;
    }
    // Allow intentional empty save only when cloud is already empty/missing.
  }

  const updatedAt = state.savedAt ?? new Date().toISOString();
  const payload = toCloudWorkspacePayload(state, updatedAt);
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });

  const { error: uploadError } = await supabase.storage
    .from(WORKSPACE_STORAGE_BUCKET)
    .upload(workspaceStoragePath(userId), blob, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });

  if (uploadError) {
    console.warn("[supabase] save workspace failed:", uploadError.message);
    return null;
  }

  const { error: rowError } = await supabase.from("app_workspace").upsert(
    {
      user_id: userId,
      updated_at: updatedAt,
    },
    { onConflict: "user_id" }
  );
  if (rowError) {
    console.warn("[supabase] workspace metadata upsert failed:", rowError.message);
  }
  return updatedAt;
}
