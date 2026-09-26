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
import { getActiveWorkspaceOwnerId } from "@/lib/supabase/activeWorkspace";
import { getSupabase } from "@/lib/supabase/client";
import { ensureCatalogDefaults } from "@/lib/supabase/catalog";
import { ensurePayrollImports } from "@/lib/import/foldPayrollImports";

export const WORKSPACE_STORAGE_BUCKET = "app-workspace";

export function workspaceStoragePath(userId: string): string {
  return `${userId}/workspace.json`;
}

export type CloudWorkspacePayload = {
  version: 1;
  updatedAt: string;
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  scenarios: Scenario[];
  /** Whole AppSettings, planned-personnel records included (see StoredAppState). */
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

function isEmptyArray<T>(value: T[] | undefined): boolean {
  return !value || value.length === 0;
}

function isEmptyRecord(value: Record<string, unknown> | undefined): boolean {
  return !value || Object.keys(value).length === 0;
}

/**
 * True when any user-authored setting beyond the payroll snapshot itself has
 * been customized — hidden funds/accounts/people, category assignments,
 * overrides, planned hires, projection rules, the org chart.
 * workspaceHasPlanningData only looks at the snapshot/imports, so a side with
 * no snapshot but real settings customization must not be treated as empty.
 *
 * Deliberately excludes personnelGroups/fundingSourceTypes/accountGroups:
 * ensureCatalogDefaults seeds those with non-empty defaults on every fresh
 * state, so their mere presence says nothing about customization — they are
 * independently synced via catalog.ts, off Supabase directly, not this blob.
 */
export function workspaceHasCustomSettings(settings: AppSettings): boolean {
  return (
    !isEmptyArray(settings.hiddenEmployeeFunds) ||
    !isEmptyRecord(settings.runwayBalanceOverrides) ||
    !isEmptyRecord(settings.runwayBurnOverrides) ||
    !isEmptyRecord(settings.accountGroupByBalanceKey) ||
    !isEmptyRecord(settings.fundingSourceCategories) ||
    !isEmptyRecord(settings.fundingSourceAliases) ||
    !isEmptyRecord(settings.employeeProfiles) ||
    !isEmptyArray(settings.hiddenEmployeeIds) ||
    !isEmptyArray(settings.alumniEmployeeIds) ||
    !isEmptyRecord(settings.employeePlanningScope) ||
    !isEmptyRecord(settings.employeePersonnelTypes) ||
    !isEmptyArray(settings.projectionRules) ||
    !isEmptyArray(settings.plannedFundingSources) ||
    !isEmptyArray(settings.plannedHires) ||
    !isEmptyArray(settings.personLinks) ||
    !isEmptyArray(settings.reconciliationChoices) ||
    Boolean(settings.orgStructure)
  );
}

/**
 * Field-by-field merge: winner's settings, filled in from the loser wherever
 * the winner is empty and the loser is not. Mirrors mergeRemoteSettings'
 * philosophy for aliases/roster ("a filled field wins, an empty field keeps
 * the other side") so picking a workspace can never silently drop settings
 * the losing side had.
 */
export function mergeSettingsPreferringWinner(
  winner: AppSettings,
  loser: AppSettings
): AppSettings {
  return {
    ...winner,
    hiddenEmployeeFunds: isEmptyArray(winner.hiddenEmployeeFunds)
      ? (loser.hiddenEmployeeFunds ?? winner.hiddenEmployeeFunds)
      : winner.hiddenEmployeeFunds,
    runwayBalanceOverrides: isEmptyRecord(winner.runwayBalanceOverrides)
      ? (loser.runwayBalanceOverrides ?? winner.runwayBalanceOverrides)
      : winner.runwayBalanceOverrides,
    runwayBurnOverrides: isEmptyRecord(winner.runwayBurnOverrides)
      ? (loser.runwayBurnOverrides ?? winner.runwayBurnOverrides)
      : winner.runwayBurnOverrides,
    accountGroupByBalanceKey: isEmptyRecord(winner.accountGroupByBalanceKey)
      ? (loser.accountGroupByBalanceKey ?? winner.accountGroupByBalanceKey)
      : winner.accountGroupByBalanceKey,
    fundingSourceCategories: isEmptyRecord(winner.fundingSourceCategories)
      ? (loser.fundingSourceCategories ?? winner.fundingSourceCategories)
      : winner.fundingSourceCategories,
    fundingSourceAliases: isEmptyRecord(winner.fundingSourceAliases)
      ? (loser.fundingSourceAliases ?? winner.fundingSourceAliases)
      : winner.fundingSourceAliases,
    employeeProfiles: isEmptyRecord(winner.employeeProfiles)
      ? (loser.employeeProfiles ?? winner.employeeProfiles)
      : winner.employeeProfiles,
    hiddenEmployeeIds: isEmptyArray(winner.hiddenEmployeeIds)
      ? (loser.hiddenEmployeeIds ?? winner.hiddenEmployeeIds)
      : winner.hiddenEmployeeIds,
    alumniEmployeeIds: isEmptyArray(winner.alumniEmployeeIds)
      ? (loser.alumniEmployeeIds ?? winner.alumniEmployeeIds)
      : winner.alumniEmployeeIds,
    employeePlanningScope: isEmptyRecord(winner.employeePlanningScope)
      ? (loser.employeePlanningScope ?? winner.employeePlanningScope)
      : winner.employeePlanningScope,
    employeePersonnelTypes: isEmptyRecord(winner.employeePersonnelTypes)
      ? (loser.employeePersonnelTypes ?? winner.employeePersonnelTypes)
      : winner.employeePersonnelTypes,
    projectionRules: isEmptyArray(winner.projectionRules)
      ? (loser.projectionRules ?? winner.projectionRules)
      : winner.projectionRules,
    plannedFundingSources: isEmptyArray(winner.plannedFundingSources)
      ? (loser.plannedFundingSources ?? winner.plannedFundingSources)
      : winner.plannedFundingSources,
    plannedHires: isEmptyArray(winner.plannedHires)
      ? (loser.plannedHires ?? winner.plannedHires)
      : winner.plannedHires,
    personLinks: isEmptyArray(winner.personLinks)
      ? (loser.personLinks ?? winner.personLinks)
      : winner.personLinks,
    reconciliationChoices: isEmptyArray(winner.reconciliationChoices)
      ? (loser.reconciliationChoices ?? winner.reconciliationChoices)
      : winner.reconciliationChoices,
    orgStructure: winner.orgStructure ?? loser.orgStructure,
  };
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

  let winner: StoredAppState;
  if (cloudHas && !localHas) {
    winner = cloudState;
  } else if (!cloudHas) {
    winner = local;
  } else {
    const localAt = local.savedAt ?? "";
    const cloudAt = cloud.updatedAt ?? "";
    winner = !localAt || cloudAt >= localAt ? cloudState : local;
  }

  // The side that lost on snapshot/imports may still hold real settings
  // customization the winner lacks (most often: it has no snapshot at all,
  // which used to mean it was discarded wholesale regardless of what
  // settings it carried).
  const loser = winner === cloudState ? local : cloudState;
  return { ...winner, settings: mergeSettingsPreferringWinner(winner.settings, loser.settings) };
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
  const userId = await getActiveWorkspaceOwnerId();
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

export async function saveCloudWorkspace(state: StoredAppState): Promise<string | null> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
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
