import type { StoredAppState } from "@/lib/storage/localStorage";
import { DEFAULT_SETTINGS } from "@/types";
import type {
  AppSettings,
  PayrollReportSnapshot,
  PortfolioReportImport,
  Scenario,
  WorkingPlan,
} from "@/types";
import { getSupabase } from "@/lib/supabase/client";

export const WORKSPACE_ID = "default";
export const WORKSPACE_STORAGE_BUCKET = "app-workspace";
export const WORKSPACE_STORAGE_PATH = "default.json";

export type CloudWorkspacePayload = {
  version: 1;
  updatedAt: string;
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  scenarios: Scenario[];
  settings: AppSettings;
  portfolioImports: PortfolioReportImport[];
};

export function workspaceHasPlanningData(state: {
  snapshot?: PayrollReportSnapshot | null;
  workingPlan?: WorkingPlan | null;
  portfolioImports?: PortfolioReportImport[];
}): boolean {
  return Boolean(
    state.snapshot ||
      state.workingPlan ||
      (state.portfolioImports && state.portfolioImports.length > 0)
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
    portfolioImports: state.portfolioImports ?? [],
  };
}

export function cloudWorkspaceToStored(
  cloud: CloudWorkspacePayload
): StoredAppState {
  return {
    snapshot: cloud.snapshot ?? null,
    workingPlan: cloud.workingPlan ?? null,
    scenarios: cloud.scenarios ?? [],
    settings: { ...DEFAULT_SETTINGS, ...cloud.settings },
    portfolioImports: cloud.portfolioImports ?? [],
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

export async function fetchCloudWorkspace(): Promise<CloudWorkspacePayload | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(WORKSPACE_STORAGE_BUCKET)
    .download(WORKSPACE_STORAGE_PATH);

  if (error || !data) {
    const message = error?.message ?? "";
    if (!/not found|does not exist/i.test(message)) {
      console.warn("[supabase] fetch workspace failed:", message || "no data");
    }
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(await data.text());
    if (!isCloudWorkspacePayload(parsed)) {
      console.warn("[supabase] workspace file is not a recognized payload");
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("[supabase] workspace JSON parse failed:", err);
    return null;
  }
}

export async function saveCloudWorkspace(state: StoredAppState): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const updatedAt = state.savedAt ?? new Date().toISOString();
  const payload = toCloudWorkspacePayload(state, updatedAt);
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });

  const { error: uploadError } = await supabase.storage
    .from(WORKSPACE_STORAGE_BUCKET)
    .upload(WORKSPACE_STORAGE_PATH, blob, {
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
      id: WORKSPACE_ID,
      updated_at: updatedAt,
    },
    { onConflict: "id" }
  );
  if (rowError) {
    console.warn("[supabase] workspace metadata upsert failed:", rowError.message);
  }
  return updatedAt;
}
