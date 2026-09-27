"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountCategory,
  AccountGroupDef,
  PersonnelType,
  AppSettings,
  Employee,
  FundingSource,
  FundingSourceTypeDef,
  ImportFileResult,
  ImportFilesResult,
  MatchDismissal,
  MonthlyAllocation,
  OrgStructure,
  ParseWarning,
  PayrollFoldOutcome,
  PayrollReportImport,
  PayrollReportSnapshot,
  PersonLink,
  PersonnelGroupDef,
  PlannedFundingSource,
  PlannedHire,
  ProjectionHorizonSettings,
  ProjectionRule,
  NetPositionReportImport,
  ReconciliationChoice,
  ReconciliationEvent,
  Scenario,
  WorkingPlan,
  PositionSalaryReportImport,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { generateId, hasPercentEffort } from "@/lib/utils/parse";
import { emptyState, loadStateForAccount, saveState } from "@/lib/storage/localStorage";
import { readWorkbook, parsePayrollFundingWorkbook } from "@/lib/parsers/payrollFundingParser";
import { getAllocations, applyAliases, getCurrentMonth } from "@/lib/calculations";
import { refreshFundingSourceColors } from "@/lib/timeline/colors";
import { isAccountActiveInMonth } from "@/lib/funding/employeeSources";
import { stripProjectFromAlias, getProjectNumber } from "@/lib/funding/alias";
import { fundingSourceKey, migrateAliasKeys } from "@/lib/funding/sourceKey";
import {
  accountsHiddenForEveryone,
  effectiveHiddenAccountKeys,
  hiddenFundKey,
  migrateHiddenFundKeys,
  withoutHiddenFundsForEmployee,
} from "@/lib/funding/visibility";
import {
  mergePayrollSnapshots,
  mergeWorkingPlanAllocations,
} from "@/lib/import/mergeSnapshots";
import {
  ensurePayrollImports,
  foldPayrollImports,
  payrollImportFromSnapshot,
} from "@/lib/import/foldPayrollImports";
import { migrateSnapshotIfNeeded } from "@/lib/import/migrateSnapshot";
import { parseNetPositionFile } from "@/lib/parsers/netPositionParser";
import { parsePositionSalaryFile } from "@/lib/parsers/positionSalaryParser";
import { overlayPositionSalaryOnSnapshot } from "@/lib/employees/positionSalary";
import { buildAccountBalances, type AccountBalance } from "@/lib/funding/accountBalances";
import {
  chartstringFundDeptProject,
  findAccountTitleForChartstring,
  normalizeChartstring,
} from "@/lib/funding/chartstring";
import {
  computePayrollBurnDefaults,
  migrateRunwayBalanceOverrideKeys,
  migrateRunwayBurnOverrideKeys,
  runwayBalanceValuesMatch,
  runwayBurnOverrideKey,
  runwayBurnValuesMatch,
  runwayOverrideKey,
} from "@/lib/runway/calculate";
import { findBalanceForChartstring } from "@/lib/funding/chartstring";
import {
  pruneEmployeeFromSettings,
  removeEmployeeFromSnapshot,
} from "@/lib/employees/roster";
import {
  employeePersonKey,
  employeePersonKeys,
  rematchEmployeeProfiles,
  resolveEmployeeProfile,
} from "@/lib/employees/stableKey";
import {
  OFFER_LETTER_MAX_BYTES,
  parseOfferLetterFile,
} from "@/lib/employees/offerLetterParse";
import { migrateCategoryKeys, setCategoryForAccountKey } from "@/lib/funding/accountCategory";
import {
  migrateAssumedOkToAccountGroups,
} from "@/lib/net-position/accountGroup";
import {
  NOT_MY_ACCOUNTS_GROUP_ID,
  UNDELETABLE_ACCOUNT_GROUP_IDS,
} from "@/lib/catalog/defaults";
import { backfillAssumedEndDates, defaultAssumedEndDate } from "@/lib/runway/assumedEndDate";
import { getProjectionOriginMonth } from "@/lib/projections/horizon";
import { upsertRule } from "@/lib/projections/rules";
import { applyChartstringRemoval, type ChartstringRemovalCheck } from "@/lib/projections/removal";
import {
  deleteOfferLetterFile,
  getOfferLetterFile,
  saveOfferLetterFile,
} from "@/lib/storage/offerLetterStore";
import { useAuth } from "@/context/AuthContext";
import { parseStorageRef } from "@/lib/supabase/signedUrl";
import {
  deleteAccountGroupAssignmentRemote,
  deleteEmployeeOfferLetterFile,
  deleteFundingSourceCategoryAssignmentRemote,
  deletePlannedFundingSourceRemote,
  deletePlannedHireRemote,
  deleteProjectionRuleRemote,
  fetchRemoteAccountGroupAssignments,
  fetchRemoteAliases,
  fetchRemoteFundingSourceCategoryAssignments,
  fetchRemoteMatchDismissals,
  fetchRemoteOrgStructure,
  fetchRemotePersonLinks,
  fetchRemotePlannedFundingSources,
  fetchRemotePlannedHires,
  fetchRemoteProjectionHorizon,
  fetchRemoteProjectionRules,
  fetchRemoteReconciliationChoices,
  fetchRemoteReconciliationEvents,
  fetchRemoteRosterMeta,
  mergeRemoteSettings,
  openOfferLetterFromCloud,
  upsertAccountGroupAssignment,
  upsertEmployeePhoto,
  upsertEmployeeRosterMeta,
  upsertFundingSourceAlias,
  upsertFundingSourceCategoryAssignment,
  upsertMatchDismissal,
  upsertOrgStructureRemote,
  upsertPersonLink,
  upsertPlannedFundingSourceRemote,
  upsertPlannedHire,
  upsertProjectionHorizonRemote,
  upsertProjectionRuleRemote,
  upsertReconciliationChoice,
  upsertReconciliationEvent,
  uploadEmployeeOfferLetterFile,
  backfillOfferLettersToCloud,
  type RosterCloudPatch,
} from "@/lib/supabase/sync";
import {
  syncCatalogFromCloud,
  upsertPersonnelGroup,
  deletePersonnelGroupRemote,
  upsertFundingSourceType,
  deleteFundingSourceTypeRemote,
  upsertAccountGroup,
  deleteAccountGroupRemote,
} from "@/lib/supabase/catalog";
import { normalizeAccountBalanceKey } from "@/lib/net-position/accountBalancesView";
import {
  fetchCloudWorkspace,
  pickWorkspace,
  saveCloudWorkspace,
  workspaceHasPlanningData,
} from "@/lib/supabase/workspace";
import {
  getActiveWorkspaceOverride,
  setActiveWorkspaceOverride,
} from "@/lib/supabase/activeWorkspace";
import { useWorkspace } from "@/context/WorkspaceContext";
import { parseStatusFromWarnings } from "@/lib/data-sources/helpers";
import { getAllMonths } from "@/lib/calculations";
import { getEmployeePersonnelType } from "@/lib/employees/personnelType";
import { getEmployeeStartDate } from "@/lib/employees/profile";
import { appendEvents, LOCAL_ACTOR } from "@/lib/reconciliation/events";
import { rateAtLinkEvent, rateSwitchEventsForImport } from "@/lib/reconciliation/forecastRate";
import { activeLinksForPerson, effectiveLinks, findEmployeeByPersonKey } from "@/lib/reconciliation/links";
import { firstChargedMonth } from "@/lib/reconciliation/closure";
import {
  addPlannedHire as addPlannedHireToSettings,
  applyDismissal,
  applyLink,
  applyUnlink,
  removePlannedHire as removePlannedHireFromSettings,
  setPinPlannedRate as setPinPlannedRateInSettings,
  updatePlannedHire as updatePlannedHireInSettings,
  type LinkInput,
} from "@/lib/reconciliation/mutations";
import { plannedHireById } from "@/lib/reconciliation/plans";
import {
  buildReconciliationView,
  describeFoldOutcome,
  type ReconciliationView,
} from "@/lib/reconciliation/view";

interface AppContextValue {
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  allocations: MonthlyAllocation[];
  settings: AppSettings;
  scenarios: Scenario[];
  loading: boolean;
  dataMigrated: boolean;
  hasData: boolean;
  importPayrollFiles: (files: File[]) => Promise<ImportFilesResult>;
  resetToImported: () => void;
  updateAllocation: (
    employeeId: string,
    fundingSourceId: string,
    month: string,
    percentEffort: number
  ) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  upsertProjectionRule: (rule: ProjectionRule) => void;
  removeProjectionRule: (id: string) => void;
  addPlannedFundingSource: (source: PlannedFundingSource) => void;
  setProjectionHorizon: (horizon: ProjectionHorizonSettings) => void;
  removeChartstringFromProjections: (
    check: Extract<ChartstringRemovalCheck, { removable: true }>
  ) => void;
  updateFundingSourceAlias: (fundingSourceId: string, aliasBase: string) => void;
  setFundingSourceCategory: (fundingSourceId: string, category: AccountCategory | null) => void;
  setFundingSourceCategoryForAccountKey: (
    accountKey: string,
    category: AccountCategory | null
  ) => void;
  toggleHiddenEmployeeFund: (employeeId: string, fundingSourceId: string) => void;
  /** Mark or unmark an account as one you don't control, by chartstring. */
  toggleNotMyAccount: (chartstring: string) => void;
  setRunwayAssumedEndDate: (accountKey: string, endDate: string | null) => void;
  unhideEmployeeFunds: (employeeId: string) => void;
  unhideAllEmployeeFunds: () => void;
  setEmployeePlanningScope: (employeeId: string, percent: number | null) => void;
  setEmployeePersonnelType: (employeeId: string, type: PersonnelType | null) => void;
  setEmployeePhotoUrl: (employeeId: string, photoUrl: string | null) => void;
  importOcrPeoplePhotos: (pageUrl?: string) => Promise<{
    matched: number;
    savedRemote: number;
    unmatchedOcrNames: string[];
  }>;
  setEmployeeStartDate: (employeeId: string, startDate: string | null) => void;
  setEmployeeEndDate: (employeeId: string, endDate: string | null) => void;
  uploadEmployeeOfferLetter: (
    employeeId: string,
    file: File
  ) => Promise<{ startDate?: string; endDate?: string }>;
  viewEmployeeOfferLetter: (employeeId: string) => Promise<void>;
  removeEmployeeOfferLetter: (employeeId: string) => Promise<void>;
  setEmployeeHidden: (employeeId: string, hidden: boolean) => void;
  setEmployeeAlumni: (employeeId: string, alumni: boolean) => void;
  deleteEmployee: (employeeId: string) => void;
  setOrgStructure: (structure: OrgStructure) => void;
  saveScenario: (name: string) => void;
  clearAll: () => void;
  fundingSources: ReturnType<typeof applyAliases>;
  accountTitlesByChartstring: Map<string, string>;
  payrollImports: PayrollReportImport[];
  netPositionImports: NetPositionReportImport[];
  positionSalaryImports: PositionSalaryReportImport[];
  accountBalances: Map<string, AccountBalance>;
  /** Explicit hides + accounts hidden on Runway for everyone, minus explicit reveals. */
  hiddenAccountKeys: string[];
  importNetPositionFiles: (files: File[]) => Promise<ImportFilesResult>;
  removeNetPositionImport: (id: string) => void;
  importPositionSalaryFiles: (files: File[]) => Promise<ImportFilesResult>;
  removePositionSalaryImport: (id: string) => void;
  removePayrollImport: (id: string) => void;
  upsertPersonnelGroupDef: (group: PersonnelGroupDef) => void;
  deletePersonnelGroupDef: (id: string) => void;
  upsertFundingSourceTypeDef: (type: FundingSourceTypeDef) => void;
  deleteFundingSourceTypeDef: (id: string) => void;
  upsertAccountGroupDef: (group: AccountGroupDef) => void;
  deleteAccountGroupDef: (id: string) => void;
  setAccountGroupForBalanceKey: (accountKey: string, groupId: string | null) => void;
  setRunwayBalanceOverride: (
    employeeId: string,
    chartstring: string,
    balance: number | null
  ) => void;
  setRunwayBurnOverride: (
    employeeId: string,
    fundingSourceId: string,
    percentEffort: number,
    monthlyBurn: number
  ) => void;
  clearRunwayBurnOverride: (employeeId: string, fundingSourceId: string) => void;
  /** Derived, never stored: every plan's status, suggested matches, who is new in the latest report. */
  reconciliation: ReconciliationView;
  /** The email every planned-personnel event records; "local" when signed out. */
  actingEmail: string;
  addPlannedHire: (plan: PlannedHire, rules: ProjectionRule[]) => void;
  updatePlannedHire: (
    id: string,
    patch: Partial<Omit<PlannedHire, "id" | "createdAt" | "createdBy">>
  ) => void;
  /** Refused while the plan is linked. */
  removePlannedHire: (id: string) => { ok: boolean; reason?: string };
  linkPlannedHire: (input: {
    plannedHireId: string;
    employeePersonKey: string;
    basis: "suggested" | "manual";
    signals: string[];
    choice: Pick<ReconciliationChoice, "forecastRate" | "pinPlannedRate" | "distribution">;
  }) => { ok: boolean; reason?: string };
  /** Refused while the person's distribution is locked in. */
  unlinkPlannedHire: (linkId: string) => { ok: boolean; reason?: string };
  dismissMatch: (plannedHireId: string, employeePersonKey: string) => void;
  setPinPlannedRate: (linkId: string, pinned: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Lift legacy "not my account" marks onto their accounts, then give every
 * marked account a horizon.
 *
 * Order matters: running the backfill first would key dates against a store
 * about to be retired. Both hydrate paths call this — a signed-in workspace
 * used to skip it entirely, so the same data behaved differently depending on
 * whether cloud sync happened to be on.
 */
/**
 * Re-key hiddenEmployeeFunds/runwayBalanceOverrides/runwayBurnOverrides from
 * legacy per-import ids to stable identity, mirroring migrateAliasKeys/
 * migrateCategoryKeys/rematchEmployeeProfiles. Run wherever those three run —
 * on every load and every import/removal — so a re-import's id reassignment
 * can never silently detach an existing hide or override.
 */
function migrateOverrideKeysForSnapshot(
  settings: AppSettings,
  snapshot: PayrollReportSnapshot | null
): AppSettings {
  if (!snapshot) return settings;
  return {
    ...settings,
    hiddenEmployeeFunds: migrateHiddenFundKeys(
      settings.hiddenEmployeeFunds ?? [],
      snapshot.employees,
      snapshot.fundingSources
    ),
    runwayBalanceOverrides: migrateRunwayBalanceOverrideKeys(
      settings.runwayBalanceOverrides ?? {},
      snapshot.employees
    ),
    runwayBurnOverrides: migrateRunwayBurnOverrideKeys(
      settings.runwayBurnOverrides ?? {},
      snapshot.employees,
      snapshot.fundingSources
    ),
  };
}

function applyAssumedEndDateRules(
  settings: AppSettings,
  snapshot: PayrollReportSnapshot | null
): AppSettings {
  const migrated = migrateAssumedOkToAccountGroups(settings, (fundingSourceId) => {
    const fs = snapshot?.fundingSources.find((f) => f.id === fundingSourceId);
    if (!fs) return null;
    return chartstringFundDeptProject(fs.accountString ?? fs.rawName);
  });
  return {
    ...migrated,
    // Workspaces saved before the end date became required can hold accounts
    // marked "not my account" with no horizon; those would keep reading as
    // infinite runway until touched by hand.
    runwayAssumedEndDates: backfillAssumedEndDates(
      Object.entries(migrated.accountGroupByBalanceKey ?? {})
        .filter(([, groupId]) => groupId === NOT_MY_ACCOUNTS_GROUP_ID)
        .map(([key]) => key),
      migrated.runwayAssumedEndDates,
      migrated.fiscalYearStartMonth,
      getProjectionOriginMonth()
    ),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PayrollReportSnapshot | null>(null);
  const [workingPlan, setWorkingPlan] = useState<WorkingPlan | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataMigrated, setDataMigrated] = useState(false);
  const [payrollImports, setPayrollImports] = useState<PayrollReportImport[]>([]);
  const [netPositionImports, setNetPositionImports] = useState<NetPositionReportImport[]>([]);
  const [positionSalaryImports, setPositionSalaryImports] = useState<PositionSalaryReportImport[]>([]);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The owner id that snapshot/workingPlan/settings currently in React state
   * actually belong to, set only at the point a hydrate commits its result.
   * The autosave effect below refuses to save unless this matches the owner
   * implied by the current render, so a workspace switch can never have the
   * debounced-save effect build a payload from the pre-switch owner's stale
   * state and write it under the post-switch owner's id.
   */
  const dataOwnerIdRef = useRef<string | null>(null);
  const { ready: authReady, cloudSyncEnabled, user } = useAuth();
  const { activeOwner, needsWorkspacePick } = useWorkspace();
  // Every planned-personnel event names who acted — the delegate when a
  // delegate acts, never the workspace owner by default.
  const actingEmail = user?.email ?? LOCAL_ACTOR;
  /**
   * True while an analyst is inside a delegated PI workspace. Delegate mode
   * is cloud-only: no local IndexedDB read/write, so the PI's payroll data
   * never lands in the analyst's own browser slots (PRIVACY.md boundary).
   */
  const actingAsDelegate = activeOwner ? !activeOwner.isSelf : false;
  const userId = user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const cloudSyncRef = useRef(cloudSyncEnabled);
  cloudSyncRef.current = cloudSyncEnabled;

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setLoading(true);
    // A workspace switch must never let the previous workspace's debounced
    // save land on the new target.
    if (cloudSaveTimer.current) {
      clearTimeout(cloudSaveTimer.current);
      cloudSaveTimer.current = null;
    }
    // This effect owns the ambient override: asserting it from activeOwner
    // here means the override and the workspace being hydrated can never
    // disagree, whatever order the providers' effects ran in.
    setActiveWorkspaceOverride(
      activeOwner && !activeOwner.isSelf
        ? { userId: activeOwner.userId, email: activeOwner.email }
        : null
    );
    /**
     * The owner this hydrate is for. The module override can flip mid-flight
     * (WorkspaceContext restores a persisted delegate selection right after
     * sign-in), so every fetch result is re-checked against it before any
     * state or browser slot is written.
     */
    const expectedOwnerId = actingAsDelegate && activeOwner ? activeOwner.userId : userId;
    const ownerStillCurrent = () =>
      (getActiveWorkspaceOverride()?.userId ?? userId) === expectedOwnerId;

    async function hydrateLocal(s: Awaited<ReturnType<typeof loadStateForAccount>>) {
      setNetPositionImports(s.netPositionImports ?? []);
      setPositionSalaryImports(s.positionSalaryImports ?? []);
      let normalizedAliases = s.snapshot
        ? migrateAliasKeys(s.settings.fundingSourceAliases, s.snapshot.fundingSources)
        : { ...s.settings.fundingSourceAliases };
      const normalizedCategories = s.snapshot
        ? migrateCategoryKeys(s.settings.fundingSourceCategories, s.snapshot.fundingSources)
        : { ...(s.settings.fundingSourceCategories ?? {}) };
      if (s.snapshot) {
        for (const fs of s.snapshot.fundingSources) {
          const entry = normalizedAliases[fundingSourceKey(fs)];
          if (entry?.alias) {
            entry.alias = stripProjectFromAlias(entry.alias, getProjectNumber(fs));
          }
        }
      }

      let settingsLocal: AppSettings = {
        ...s.settings,
        fundingSourceAliases: normalizedAliases,
        fundingSourceCategories: normalizedCategories,
        employeeProfiles: s.snapshot
          ? rematchEmployeeProfiles(s.settings.employeeProfiles, s.snapshot.employees)
          : { ...(s.settings.employeeProfiles ?? {}) },
      };

      settingsLocal = applyAssumedEndDateRules(settingsLocal, s.snapshot);
      settingsLocal = migrateOverrideKeysForSnapshot(settingsLocal, s.snapshot);

      if (cancelled) return;

      let snap = s.snapshot ? refreshFundingSourceColors(s.snapshot) : null;
      let plan = s.workingPlan;
      if (snap) {
        const migrated = migrateSnapshotIfNeeded(snap, plan);
        snap = refreshFundingSourceColors(migrated.snapshot);
        plan = migrated.workingPlan;
        setDataMigrated(migrated.migrated);
      }
      dataOwnerIdRef.current = expectedOwnerId;
      setPayrollImports(ensurePayrollImports(snap, s.payrollImports));
      setSnapshot(snap);
      setWorkingPlan(plan);
      setSettings(settingsLocal);
      setScenarios(s.scenarios);
      setLoading(false);
    }

    async function hydrate() {
      const ownerEmail = user?.email ?? (user?.user_metadata?.email as string | undefined);
      // Delegate mode never touches the analyst's own browser slots — the
      // cloud copy of the PI's workspace is the only source and sink.
      const s = actingAsDelegate ? emptyState() : await loadStateForAccount(userId, ownerEmail);

      if (!cloudSyncEnabled) {
        await hydrateLocal(s);
        return;
      }

      const cloud = await fetchCloudWorkspace();

      const [
        remoteAliases,
        remoteRoster,
        remoteAccountGroups,
        remoteFundingSourceCategories,
        remotePlannedHires,
        remotePersonLinks,
        remoteReconciliationChoices,
        remoteMatchDismissals,
        remoteProjectionRules,
        remotePlannedFundingSources,
        remoteProjectionHorizon,
        remoteOrgStructure,
        remoteReconciliationEvents,
      ] = await Promise.all([
        fetchRemoteAliases(),
        fetchRemoteRosterMeta(),
        fetchRemoteAccountGroupAssignments(),
        fetchRemoteFundingSourceCategoryAssignments(),
        fetchRemotePlannedHires(),
        fetchRemotePersonLinks(),
        fetchRemoteReconciliationChoices(),
        fetchRemoteMatchDismissals(),
        fetchRemoteProjectionRules(),
        fetchRemotePlannedFundingSources(),
        fetchRemoteProjectionHorizon(),
        fetchRemoteOrgStructure(),
        fetchRemoteReconciliationEvents(),
      ]);
      if (cancelled || !ownerStillCurrent()) return;
      const workspace = actingAsDelegate
        ? cloud
          ? pickWorkspace(emptyState(), cloud)
          : emptyState()
        : pickWorkspace(s, cloud);

      // Persist recovered lab data into the owner browser slot immediately.
      if (
        !actingAsDelegate &&
        userId &&
        workspaceHasPlanningData(workspace) &&
        !workspaceHasPlanningData(s)
      ) {
        void saveState(workspace, userId);
      }

      let settingsLocal: AppSettings = {
        ...workspace.settings,
        fundingSourceAliases: workspace.snapshot
          ? migrateAliasKeys(workspace.settings.fundingSourceAliases, workspace.snapshot.fundingSources)
          : { ...workspace.settings.fundingSourceAliases },
        fundingSourceCategories: workspace.snapshot
          ? migrateCategoryKeys(workspace.settings.fundingSourceCategories, workspace.snapshot.fundingSources)
          : { ...(workspace.settings.fundingSourceCategories ?? {}) },
        employeeProfiles: workspace.snapshot
          ? rematchEmployeeProfiles(workspace.settings.employeeProfiles, workspace.snapshot.employees)
          : { ...(workspace.settings.employeeProfiles ?? {}) },
      };

      if (workspace.snapshot) {
        for (const fs of workspace.snapshot.fundingSources) {
          const entry = settingsLocal.fundingSourceAliases[fundingSourceKey(fs)];
          if (entry?.alias) {
            entry.alias = stripProjectFromAlias(entry.alias, getProjectNumber(fs));
          }
        }
      }

      settingsLocal = mergeRemoteSettings(
        settingsLocal,
        remoteAliases,
        remoteRoster,
        workspace.snapshot?.employees ?? [],
        remoteAccountGroups,
        remoteFundingSourceCategories,
        remotePlannedHires,
        remotePersonLinks,
        remoteReconciliationChoices,
        remoteMatchDismissals,
        remoteProjectionRules,
        remotePlannedFundingSources,
        remoteProjectionHorizon,
        remoteOrgStructure,
        remoteReconciliationEvents
      );
      if (workspace.snapshot) {
        settingsLocal = {
          ...settingsLocal,
          fundingSourceAliases: migrateAliasKeys(
            settingsLocal.fundingSourceAliases,
            workspace.snapshot.fundingSources
          ),
          employeeProfiles: rematchEmployeeProfiles(
            settingsLocal.employeeProfiles,
            workspace.snapshot.employees
          ),
        };
      }

      settingsLocal = applyAssumedEndDateRules(settingsLocal, workspace.snapshot);
      settingsLocal = migrateOverrideKeysForSnapshot(settingsLocal, workspace.snapshot);

      settingsLocal = await syncCatalogFromCloud(settingsLocal);

      let snap = workspace.snapshot ? refreshFundingSourceColors(workspace.snapshot) : null;
      let plan = workspace.workingPlan;
      if (snap) {
        const migrated = migrateSnapshotIfNeeded(snap, plan);
        snap = refreshFundingSourceColors(migrated.snapshot);
        plan = migrated.workingPlan;
        setDataMigrated(migrated.migrated);
      }
      if (cancelled || !ownerStillCurrent()) return;
      dataOwnerIdRef.current = expectedOwnerId;
      setNetPositionImports(workspace.netPositionImports ?? []);
      setPositionSalaryImports(workspace.positionSalaryImports ?? []);
      setPayrollImports(ensurePayrollImports(snap, workspace.payrollImports));
      setSnapshot(snap);
      setWorkingPlan(plan);
      setSettings(settingsLocal);
      setScenarios(workspace.scenarios ?? []);
      setLoading(false);
      // The backfill reads the analyst's local offer-letter blobs — wrong
      // source and wrong target for a delegated workspace.
      if (snap && !actingAsDelegate) void backfillOfferLettersToCloud(snap.employees, settingsLocal);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    cloudSyncEnabled,
    userId,
    user?.email,
    user?.user_metadata?.email,
    activeOwner,
    actingAsDelegate,
  ]);

  useEffect(() => {
    if (loading) return;
    // An analyst with no PI workspace open has no workspace of their own to
    // persist — writing would mint empty local and cloud artifacts under
    // their account, which the analyst model says must not exist.
    if (needsWorkspacePick) return;
    // snapshot/workingPlan/settings above are whatever the last hydrate
    // committed them as; on a workspace switch this effect re-fires (its
    // deps include activeOwner/actingAsDelegate) before that hydrate's async
    // fetch resolves, while the values above still belong to the owner that
    // was active before the switch. Saving them now would write the old
    // owner's stale data under the new owner's id. Skip until the pending
    // hydrate commits and re-tags dataOwnerIdRef to the current owner.
    const ownerIdForCurrentState = actingAsDelegate && activeOwner ? activeOwner.userId : userId;
    if (dataOwnerIdRef.current !== ownerIdForCurrentState) return;
    const savedAt = new Date().toISOString();
    const state = {
      snapshot,
      workingPlan,
      scenarios,
      settings,
      payrollImports,
      netPositionImports,
      positionSalaryImports,
      savedAt,
    };
    // Delegate mode is cloud-only: the PI's data must not be cached into the
    // analyst's own browser slot.
    if (!actingAsDelegate) void saveState(state, userIdRef.current);
    if (!cloudSyncRef.current) return;
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    // Belt and suspenders against a save closure surviving a workspace
    // switch: capture the target at schedule time and re-check at fire time.
    const scheduledOwnerId = getActiveWorkspaceOverride()?.userId ?? userIdRef.current;
    cloudSaveTimer.current = setTimeout(() => {
      if (!cloudSyncRef.current) return;
      const currentOwnerId = getActiveWorkspaceOverride()?.userId ?? userIdRef.current;
      if (currentOwnerId !== scheduledOwnerId) return;
      void saveCloudWorkspace(state);
    }, 1500);
    return () => {
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    };
  }, [
    snapshot,
    workingPlan,
    scenarios,
    settings,
    payrollImports,
    netPositionImports,
    positionSalaryImports,
    loading,
    cloudSyncEnabled,
    userId,
    activeOwner,
    actingAsDelegate,
    needsWorkspacePick,
  ]);

  // Runway resolves every balance through this map, so anything missing here
  // is treated as $0.
  const accountBalances = useMemo(
    () => buildAccountBalances(netPositionImports),
    [netPositionImports]
  );

  const snapshotForUi = useMemo(
    () => overlayPositionSalaryOnSnapshot(snapshot, positionSalaryImports),
    [snapshot, positionSalaryImports]
  );

  /**
   * Accounts hidden on Runway/Timeline for every person charging them, unioned
   * with explicit hides and minus explicit reveals. Computed once here so
   * Account Balances, Settings and the Dashboard cannot disagree about which
   * accounts are hidden.
   */
  const hiddenAccountKeys = useMemo(() => {
    if (!snapshot) return effectiveHiddenAccountKeys(settings, new Set<string>());
    const currentMonth = getCurrentMonth(snapshot);
    const currentAllocations = getAllocations(snapshot, workingPlan);
    const pairs: { employee: Employee; fundingSource: FundingSource; accountKey: string }[] = [];
    for (const emp of snapshot.employees) {
      for (const fs of snapshot.fundingSources) {
        if (!isAccountActiveInMonth(emp.id, fs.id, currentMonth, snapshot, currentAllocations)) continue;
        const accountKey = normalizeAccountBalanceKey(
          chartstringFundDeptProject(fs.accountString ?? fs.rawName) ?? fs.accountString ?? fs.rawName
        );
        pairs.push({ employee: emp, fundingSource: fs, accountKey });
      }
    }
    return effectiveHiddenAccountKeys(settings, accountsHiddenForEveryone(pairs, settings));
  }, [snapshot, workingPlan, settings]);

  const accountTitlesByChartstring = useMemo(() => {
    const map = new Map<string, string>();
    if (!snapshot) return map;
    for (const fs of snapshot.fundingSources) {
      if (!fs.accountString) continue;
      const title = findAccountTitleForChartstring(
        fs.accountString,
        accountBalances
      );
      if (title) map.set(fs.accountString, title);
    }
    return map;
  }, [snapshot, accountBalances]);

  const allocations = useMemo(
    () => (snapshot ? getAllocations(snapshot, workingPlan) : []),
    [snapshot, workingPlan]
  );

  /**
   * Derived, never stored. Computed once here so Employees, Projections and
   * Upload read the same suggestions, statuses and "new in this report" set.
   */
  const reconciliation = useMemo(
    () =>
      buildReconciliationView({
        snapshot: snapshotForUi,
        payrollImports,
        settings,
        accountTitlesByChartstring,
      }),
    [snapshotForUi, payrollImports, settings, accountTitlesByChartstring]
  );

  const fundingSources = useMemo(
    () =>
      snapshot
        ? applyAliases(
            snapshot.fundingSources,
            settings.fundingSourceAliases,
            accountTitlesByChartstring
          )
        : [],
    [snapshot, settings.fundingSourceAliases, accountTitlesByChartstring]
  );

  /**
   * Parse and apply in one step, the same shape as importNetPositionFiles and
   * importPositionSalaryFiles. This used to be a two-stage flow — parse into
   * pending state, then a Confirm button applied it and pushed to
   * Distributions — which made the payroll card the only uploader that did not
   * simply land the file in its Uploaded list.
   *
   * A failed parse does not throw; it yields an empty snapshot beside its
   * error warnings. The preview's Confirm button used to be disabled for that
   * case, so here such a file is skipped per-file (the old gate only ever
   * looked at the last file of a batch) while its warnings still surface.
   */
  const importPayrollFiles = useCallback(
    async (files: File[]): Promise<ImportFilesResult> => {
      const warnings: ParseWarning[] = [];
      const fileResults: ImportFileResult[] = [];
      const incomingImports: PayrollReportImport[] = [];
      let merged = snapshot;
      const overwritten = new Set<string>();
      let isMerge = false;

      for (const file of files) {
        try {
          const wb = await readWorkbook(file);
          const { snapshot: incoming, preview } = parsePayrollFundingWorkbook(wb, file.name);
          warnings.push(...preview.warnings);
          fileResults.push({ fileName: file.name, status: preview.parseStatus });
          if (preview.parseStatus === "failed") continue;
          incomingImports.push(payrollImportFromSnapshot(incoming));
          const merge = mergePayrollSnapshots(merged, incoming);
          merge.overwrittenMonths.forEach((m) => overwritten.add(m));
          if (merge.isMerge) isMerge = true;
          merged = merge.snapshot;
        } catch (err) {
          fileResults.push({ fileName: file.name, status: "failed" });
          warnings.push({
            id: generateId(),
            severity: "error",
            message: `${file.name}: ${err instanceof Error ? err.message : "Parse failed"}`,
          });
        }
      }

      if (!merged || incomingImports.length === 0) {
        return { warnings, files: fileResults };
      }
      const next = merged;

      /**
       * The automatic rate switch (owner decision 1) and the upload's own
       * outcome line are both read off the folded report here, once, with
       * the FY rates overlaid the way every page sees them. Events are
       * computed from the settings this handler closed over and appended
       * inside the updater, so a second render of the updater cannot add
       * them twice.
       */
      const overlaid = overlayPositionSalaryOnSnapshot(next, positionSalaryImports) ?? next;
      const migratedSettings: AppSettings = migrateOverrideKeysForSnapshot(
        {
          ...settings,
          fundingSourceAliases: migrateAliasKeys(settings.fundingSourceAliases, next.fundingSources),
          fundingSourceCategories: migrateCategoryKeys(
            settings.fundingSourceCategories,
            next.fundingSources
          ),
          employeeProfiles: rematchEmployeeProfiles(settings.employeeProfiles, next.employees),
        },
        next
      );
      const reportFile = incomingImports[incomingImports.length - 1]?.sourceFileName ?? "";
      const rateEvents = rateSwitchEventsForImport({
        snapshot: overlaid,
        settings: migratedSettings,
        by: actingEmail,
        reportFile,
      });
      const settingsAfter = appendEvents(migratedSettings, rateEvents);
      const importsAfter = [...payrollImports, ...incomingImports];
      const viewBefore = buildReconciliationView({
        snapshot: snapshotForUi,
        payrollImports,
        settings,
        accountTitlesByChartstring,
      });
      const viewAfter = buildReconciliationView({
        snapshot: overlaid,
        payrollImports: importsAfter,
        settings: settingsAfter,
        accountTitlesByChartstring,
      });
      // "New employees" here is the diff against the fold before this upload
      // — a re-upload of the same file adds nobody — which is a different
      // question from the view's "new in this report" (who the latest report
      // shows that no earlier report did). A first upload has no earlier
      // fold to diff, so it carries no outcome line beyond "Uploaded".
      const keysBefore = new Set(snapshot ? snapshot.employees.flatMap(employeePersonKeys) : []);
      const fold: PayrollFoldOutcome | undefined =
        isMerge && snapshot
          ? describeFoldOutcome({
              before: viewBefore,
              after: viewAfter,
              replacedMonths: [...overwritten].sort(),
              preservedMonths: getAllMonths(next).filter((m) => !overwritten.has(m)),
              newEmployees: overlaid.employees.filter(
                (e) => !employeePersonKeys(e).some((k) => keysBefore.has(k))
              ),
              eventsAdded: rateEvents.length,
            })
          : undefined;

      setSettings((prev) =>
        appendEvents(
          migrateOverrideKeysForSnapshot(
            {
              ...prev,
              fundingSourceAliases: migrateAliasKeys(prev.fundingSourceAliases, next.fundingSources),
              fundingSourceCategories: migrateCategoryKeys(
                prev.fundingSourceCategories,
                next.fundingSources
              ),
              employeeProfiles: rematchEmployeeProfiles(prev.employeeProfiles, next.employees),
            },
            next
          ),
          rateEvents
        )
      );
      if (cloudSyncRef.current) {
        for (const e of rateEvents) void upsertReconciliationEvent(e);
      }

      setSnapshot(refreshFundingSourceColors(next));

      setWorkingPlan((prev) => ({
        snapshotId: next.id,
        allocations: isMerge
          ? mergeWorkingPlanAllocations(prev?.allocations, next, overwritten)
          : next.monthlyAllocations.map((a) => ({ ...a })),
        updatedAt: new Date().toISOString(),
      }));

      setPayrollImports((prev) => [...prev, ...incomingImports]);

      return { warnings, files: fileResults, fold };
    },
    [
      snapshot,
      snapshotForUi,
      settings,
      payrollImports,
      positionSalaryImports,
      accountTitlesByChartstring,
      actingEmail,
    ]
  );

  const resetToImported = useCallback(() => {
    if (!snapshot) return;
    setWorkingPlan({
      snapshotId: snapshot.id,
      allocations: snapshot.monthlyAllocations.map((a) => ({ ...a })),
      updatedAt: new Date().toISOString(),
    });
  }, [snapshot]);

  const updateAllocation = useCallback(
    (employeeId: string, fundingSourceId: string, month: string, percentEffort: number) => {
      if (!snapshot) return;
      setWorkingPlan((prev) => {
        const base = prev ?? {
          snapshotId: snapshot.id,
          allocations: snapshot.monthlyAllocations.map((a) => ({ ...a })),
          updatedAt: new Date().toISOString(),
        };
        const key = `${employeeId}|${fundingSourceId}|${month}`;
        const existing = base.allocations.find(
          (a) => `${a.employeeId}|${a.fundingSourceId}|${a.month}` === key
        );
        let nextAllocs = [...base.allocations];
        if (existing) {
          if (!hasPercentEffort(percentEffort)) {
            nextAllocs = nextAllocs.filter((a) => a.id !== existing.id);
          } else {
            nextAllocs = nextAllocs.map((a) =>
              a.id === existing.id
                ? { ...a, percentEffort, status: "edited" as const }
                : a
            );
          }
        } else if (hasPercentEffort(percentEffort)) {
          const imported = snapshot.monthlyAllocations.find(
            (a) =>
              a.employeeId === employeeId &&
              a.fundingSourceId === fundingSourceId &&
              a.month === month
          );
          nextAllocs.push({
            id: generateId(),
            employeeId,
            fundingSourceId,
            month,
            percentEffort,
            sourceType: imported?.sourceType ?? "future",
            status: "edited",
          });
        }
        return { ...base, allocations: nextAllocs, updatedAt: new Date().toISOString() };
      });
    },
    [snapshot]
  );

  const updateSettings = useCallback((s: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...s }));
  }, []);

  const upsertProjectionRule = useCallback(
    (rule: ProjectionRule) => {
      // upsertRule can silently replace a different rule sharing the same
      // person+chartstring — delete its remote row too, or it would reappear
      // on the next fetch.
      const displaced = (settings.projectionRules ?? []).find(
        (r) =>
          r.id !== rule.id &&
          r.personKey === rule.personKey &&
          (r.chartstringKey ?? null) === (rule.chartstringKey ?? null)
      );
      setSettings((prev) => ({
        ...prev,
        projectionRules: upsertRule(prev.projectionRules ?? [], rule),
      }));
      if (cloudSyncRef.current) {
        if (displaced) void deleteProjectionRuleRemote(displaced.id);
        void upsertProjectionRuleRemote(rule);
      }
    },
    [settings.projectionRules]
  );

  const removeProjectionRule = useCallback((id: string) => {
    setSettings((prev) => ({
      ...prev,
      projectionRules: (prev.projectionRules ?? []).filter((r) => r.id !== id),
    }));
    if (cloudSyncRef.current) void deleteProjectionRuleRemote(id);
  }, []);

  const addPlannedFundingSource = useCallback((source: PlannedFundingSource) => {
    setSettings((prev) => ({
      ...prev,
      plannedFundingSources: [...(prev.plannedFundingSources ?? []), source],
    }));
    if (cloudSyncRef.current) void upsertPlannedFundingSourceRemote(source);
  }, []);

  const setProjectionHorizon = useCallback((horizon: ProjectionHorizonSettings) => {
    setSettings((prev) => ({ ...prev, projectionHorizon: horizon }));
    if (cloudSyncRef.current) void upsertProjectionHorizonRemote(horizon);
  }, []);

  /**
   * Removing a chartstring from Projections can delete/rewind several rules
   * and drop a planned funding source in one action — the check object
   * already names exactly which ids changed, so the remote sync mirrors
   * that instead of diffing arrays.
   */
  const removeChartstringFromProjections = useCallback(
    (check: Extract<ChartstringRemovalCheck, { removable: true }>) => {
      const repairedRules = (settings.projectionRules ?? []).filter((r) =>
        check.remainderRuleIdsToRepair.includes(r.id)
      );
      setSettings((prev) => applyChartstringRemoval(prev, check));
      if (cloudSyncRef.current) {
        for (const id of check.ruleIdsToDelete) void deleteProjectionRuleRemote(id);
        for (const rule of repairedRules) {
          void upsertProjectionRuleRemote({ ...rule, remainder: { kind: "uncovered" } });
        }
        if (check.removePlannedSourceId) {
          void deletePlannedFundingSourceRemote(check.removePlannedSourceId);
        }
      }
    },
    [settings.projectionRules]
  );

  const toggleHiddenEmployeeFund = useCallback(
    (employeeId: string, fundingSourceId: string) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      const fs = snapshot?.fundingSources.find((f) => f.id === fundingSourceId);
      const key = hiddenFundKey(
        emp ? employeePersonKey(emp) : employeeId,
        fs ? fundingSourceKey(fs) : fundingSourceId
      );
      setSettings((prev) => {
        const hidden = new Set(prev.hiddenEmployeeFunds ?? []);
        if (hidden.has(key)) hidden.delete(key);
        else hidden.add(key);
        return { ...prev, hiddenEmployeeFunds: [...hidden] };
      });
    },
    [snapshot]
  );

  /**
   * "Not my account" is a property of the account, so the landmark mark writes the
   * account group — the single place it is stored. Marking from Runway or the
   * timeline and assigning the group in Settings are the same action.
   */
  const toggleNotMyAccount = useCallback(
    (chartstring: string) => {
      const root = chartstringFundDeptProject(chartstring) ?? chartstring;
      const key = normalizeAccountBalanceKey(root);
      const wasNotMine = settings.accountGroupByBalanceKey?.[key] === NOT_MY_ACCOUNTS_GROUP_ID;

      setSettings((prev) => {
        const groups = { ...(prev.accountGroupByBalanceKey ?? {}) };
        const endDates = { ...(prev.runwayAssumedEndDates ?? {}) };

        if (groups[key] === NOT_MY_ACCOUNTS_GROUP_ID) {
          delete groups[key];
          delete endDates[key];
        } else {
          groups[key] = NOT_MY_ACCOUNTS_GROUP_ID;
          // Marking an account always gives it a horizon. Without one it would
          // read as never running out, and there is no such thing as infinite
          // runway — fiscal year end is editable, but it is never absent.
          if (!endDates[key]) {
            endDates[key] = defaultAssumedEndDate(
              prev.fiscalYearStartMonth,
              getProjectionOriginMonth()
            );
          }
        }
        return { ...prev, accountGroupByBalanceKey: groups, runwayAssumedEndDates: endDates };
      });

      if (cloudSyncRef.current) {
        if (wasNotMine) void deleteAccountGroupAssignmentRemote(key);
        else void upsertAccountGroupAssignment(key, NOT_MY_ACCOUNTS_GROUP_ID);
      }
    },
    [settings.accountGroupByBalanceKey]
  );

  const setRunwayAssumedEndDate = useCallback(
    (accountKey: string, endDate: string | null) => {
      const key = normalizeAccountBalanceKey(
        chartstringFundDeptProject(accountKey) ?? accountKey
      );
      setSettings((prev) => {
        const endDates = { ...(prev.runwayAssumedEndDates ?? {}) };
        const stillNotMine =
          (prev.accountGroupByBalanceKey ?? {})[key] === NOT_MY_ACCOUNTS_GROUP_ID;
        if (endDate) {
          endDates[key] = endDate;
        } else if (stillNotMine) {
          // Clearing the field falls back to the default rather than emptying
          // it. The requirement is held here, not defended in the input.
          endDates[key] = defaultAssumedEndDate(
            prev.fiscalYearStartMonth,
            getProjectionOriginMonth()
          );
        } else {
          delete endDates[key];
        }
        return { ...prev, runwayAssumedEndDates: endDates };
      });
    },
    []
  );

  const unhideEmployeeFunds = useCallback(
    (employeeId: string) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      const key = emp ? employeePersonKey(emp) : employeeId;
      setSettings((prev) => ({
        ...prev,
        hiddenEmployeeFunds: withoutHiddenFundsForEmployee(prev.hiddenEmployeeFunds ?? [], key),
      }));
    },
    [snapshot]
  );

  const unhideAllEmployeeFunds = useCallback(() => {
    setSettings((prev) => ({ ...prev, hiddenEmployeeFunds: [] }));
  }, []);

  const pushRosterCloud = useCallback(
    (employeeId: string, patch: Omit<RosterCloudPatch, "personKey" | "displayName">) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      if (!emp || !cloudSyncRef.current) return;
      void upsertEmployeeRosterMeta({
        ...patch,
        personKey: employeePersonKey(emp),
        displayName: emp.name,
      });
    },
    [snapshot]
  );

  const setEmployeePlanningScope = useCallback((employeeId: string, percent: number | null) => {
    const nextPercent =
      percent === null || Number.isNaN(percent) ? null : Math.max(0, Math.min(100, percent));
    setSettings((prev) => {
      const next = { ...(prev.employeePlanningScope ?? {}) };
      if (nextPercent === null) delete next[employeeId];
      else next[employeeId] = nextPercent;
      return { ...prev, employeePlanningScope: next };
    });
    pushRosterCloud(employeeId, { planningScope: nextPercent });
  }, [pushRosterCloud]);

  const setEmployeePersonnelType = useCallback(
    (employeeId: string, type: PersonnelType | null) => {
      setSettings((prev) => {
        const next = { ...(prev.employeePersonnelTypes ?? {}) };
        if (type === null) delete next[employeeId];
        else next[employeeId] = type;
        return { ...prev, employeePersonnelTypes: next };
      });
      pushRosterCloud(employeeId, { personnelType: type });
    },
    [pushRosterCloud]
  );

  const patchEmployeeProfile = useCallback(
    (
      employeeId: string,
      patch: (current: NonNullable<AppSettings["employeeProfiles"]>[string]) => void
    ) => {
      setSettings((prev) => {
        const emp = snapshot?.employees.find((e) => e.id === employeeId);
        const personKey = emp ? employeePersonKey(emp) : null;
        const profiles = { ...(prev.employeeProfiles ?? {}) };
        const current = {
          ...(personKey ? profiles[personKey] ?? {} : {}),
          ...(profiles[employeeId] ?? {}),
        };
        patch(current);
        const hasData =
          current.photoUrl ||
          current.startDate ||
          current.endDate ||
          current.offerLetter;
        if (hasData) {
          profiles[employeeId] = current;
          if (personKey) {
            profiles[personKey] = {
              photoUrl: current.photoUrl,
              startDate: current.startDate,
              endDate: current.endDate,
              offerLetter: current.offerLetter,
            };
          }
        } else {
          delete profiles[employeeId];
          if (personKey) delete profiles[personKey];
        }
        return { ...prev, employeeProfiles: profiles };
      });
    },
    [snapshot]
  );

  const setEmployeePhotoUrl = useCallback(
    (employeeId: string, photoUrl: string | null) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      patchEmployeeProfile(employeeId, (current) => {
        if (photoUrl?.trim()) current.photoUrl = photoUrl.trim();
        else delete current.photoUrl;
      });
      if (emp && cloudSyncRef.current) {
        const ref = parseStorageRef(photoUrl);
        void upsertEmployeePhoto({
          personKey: employeePersonKey(emp),
          displayName: emp.name,
          photoUrl: photoUrl?.trim() || null,
          photoPath: ref?.bucket === "employee-photos" ? ref.path : null,
        });
      }
    },
    [patchEmployeeProfile, snapshot]
  );

  const importOcrPeoplePhotos = useCallback(
    async (pageUrl?: string) => {
      if (!snapshot) {
        return { matched: 0, savedRemote: 0, unmatchedOcrNames: [] as string[] };
      }
      let photos:
        | { name: string; photoUrl: string }[]
        | undefined;
      if (pageUrl?.trim()) {
        const res = await fetch("/api/lab-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageUrl: pageUrl.trim() }),
        });
        const body = (await res.json()) as {
          photos?: { name: string; photoUrl: string }[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error || "Could not import photos from that page.");
        }
        photos = body.photos ?? [];
        if (photos.length === 0) {
          throw new Error(
            "No person photos found on that page. Try a People/Team page with named headshots."
          );
        }
      }
      const { syncLabPeoplePhotos, syncOcrPeoplePhotos } = await import("@/lib/ocr/syncPhotos");
      const { settings: nextSettings, result } = photos
        ? await syncLabPeoplePhotos({
            settings,
            employees: snapshot.employees,
            photos,
          })
        : await syncOcrPeoplePhotos({
            settings,
            employees: snapshot.employees,
          });
      setSettings(nextSettings);
      return result;
    },
    [snapshot, settings]
  );

  const setEmployeeStartDate = useCallback(
    (employeeId: string, startDate: string | null) => {
      patchEmployeeProfile(employeeId, (current) => {
        if (startDate) current.startDate = startDate;
        else delete current.startDate;
      });
      pushRosterCloud(employeeId, { startDate });
    },
    [patchEmployeeProfile, pushRosterCloud]
  );

  const setEmployeeEndDate = useCallback(
    (employeeId: string, endDate: string | null) => {
      patchEmployeeProfile(employeeId, (current) => {
        if (endDate) current.endDate = endDate;
        else delete current.endDate;
      });
      pushRosterCloud(employeeId, { endDate });
    },
    [patchEmployeeProfile, pushRosterCloud]
  );

  const uploadEmployeeOfferLetter = useCallback(
    async (employeeId: string, file: File) => {
      if (file.size > OFFER_LETTER_MAX_BYTES) {
        throw new Error("Offer letter must be under 12 MB.");
      }
      const { startDate, endDate, startingSalary } = await parseOfferLetterFile(file);
      const uploadedAt = new Date().toISOString();
      // Delegate mode is cloud-only: a PI's offer letter must never be cached
      // into the analyst's own local IndexedDB.
      if (!actingAsDelegate) {
        await saveOfferLetterFile(
          {
            employeeId,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            uploadedAt,
            blob: file,
          },
          userIdRef.current
        );
      }
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      let fileUrl: string | undefined;
      let storagePath: string | undefined;
      if (emp && cloudSyncRef.current) {
        try {
          const uploaded = await uploadEmployeeOfferLetterFile(emp, file);
          fileUrl = uploaded.storageRef;
          storagePath = uploaded.storagePath;
        } catch (err) {
          console.warn("[supabase] offer letter upload failed:", err);
        }
      }
      const offerLetter = {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        uploadedAt,
        extractedStartDate: startDate,
        extractedEndDate: endDate,
        extractedStartingSalary: startingSalary,
        fileUrl,
        storagePath,
      };
      patchEmployeeProfile(employeeId, (current) => {
        current.offerLetter = offerLetter;
        if (startDate) current.startDate = startDate;
        if (endDate) current.endDate = endDate;
      });
      pushRosterCloud(employeeId, {
        offerLetter,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
      });
      return { startDate, endDate };
    },
    [patchEmployeeProfile, pushRosterCloud, snapshot, actingAsDelegate]
  );

  const viewEmployeeOfferLetter = useCallback(async (employeeId: string) => {
    // Delegate mode is cloud-only: never read the analyst's own local cache,
    // which cannot hold this PI's file anyway now that uploads skip it.
    const stored = actingAsDelegate ? null : await getOfferLetterFile(employeeId, userIdRef.current);
    if (stored) {
      const url = URL.createObjectURL(stored.blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const emp = snapshot?.employees.find((e) => e.id === employeeId);
    const letter = emp
      ? resolveEmployeeProfile(settings, emp)?.offerLetter
      : settings.employeeProfiles?.[employeeId]?.offerLetter;
    if (!letter) throw new Error("No offer letter on file.");
    await openOfferLetterFromCloud(letter);
  }, [snapshot, settings, actingAsDelegate]);

  const removeEmployeeOfferLetter = useCallback(
    async (employeeId: string) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      const existing = emp
        ? resolveEmployeeProfile(settings, emp)?.offerLetter
        : settings.employeeProfiles?.[employeeId]?.offerLetter;
      // Delegate mode is cloud-only: nothing of the PI's should be in the
      // analyst's own local IndexedDB to delete.
      if (!actingAsDelegate) {
        await deleteOfferLetterFile(employeeId, userIdRef.current);
      }
      if (existing?.storagePath && cloudSyncRef.current) {
        await deleteEmployeeOfferLetterFile(existing.storagePath);
      }
      patchEmployeeProfile(employeeId, (current) => {
        delete current.offerLetter;
      });
      pushRosterCloud(employeeId, { offerLetter: null });
    },
    [patchEmployeeProfile, pushRosterCloud, snapshot, settings, actingAsDelegate]
  );

  const setEmployeeHidden = useCallback((employeeId: string, hidden: boolean) => {
    setSettings((prev) => {
      const ids = new Set(prev.hiddenEmployeeIds ?? []);
      if (hidden) ids.add(employeeId);
      else ids.delete(employeeId);
      return { ...prev, hiddenEmployeeIds: [...ids] };
    });
    pushRosterCloud(employeeId, { hidden });
  }, [pushRosterCloud]);

  const setEmployeeAlumni = useCallback((employeeId: string, alumni: boolean) => {
    setSettings((prev) => {
      const alumniIds = new Set(prev.alumniEmployeeIds ?? []);
      const hiddenIds = new Set(prev.hiddenEmployeeIds ?? []);
      if (alumni) {
        alumniIds.add(employeeId);
        hiddenIds.delete(employeeId);
      } else {
        alumniIds.delete(employeeId);
      }
      return {
        ...prev,
        alumniEmployeeIds: [...alumniIds],
        hiddenEmployeeIds: [...hiddenIds],
      };
    });
    pushRosterCloud(employeeId, { alumni, hidden: alumni ? false : undefined });
  }, [pushRosterCloud]);

  const setOrgStructure = useCallback((structure: OrgStructure) => {
    setSettings((prev) => ({ ...prev, orgStructure: structure }));
    if (cloudSyncRef.current) void upsertOrgStructureRemote(structure);
  }, []);

  /**
   * Deleting a person reverses any plan linked to them first — with the
   * same unlink event a manual reversal writes — so the plan returns to
   * Projections as its own row rather than pointing at nobody.
   */
  const deleteEmployee = useCallback(
    (employeeId: string) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      const links = emp
        ? activeLinksForPerson(effectiveLinks(settings, snapshot?.employees ?? []), employeePersonKey(emp))
        : [];
      setSnapshot((prev) => (prev ? removeEmployeeFromSnapshot(prev, employeeId) : prev));
      setWorkingPlan((prev) =>
        prev
          ? {
              ...prev,
              allocations: prev.allocations.filter((a) => a.employeeId !== employeeId),
              updatedAt: new Date().toISOString(),
            }
          : prev
      );
      // Any of the employee's active links get auto-reversed below, and their
      // org-chart membership is pruned — both need the same remote sync a
      // manual Unlink or a setOrgStructure call gets, or a deleted employee's
      // stale link/branch membership would reappear on the next cloud fetch.
      const reversedLinks: PersonLink[] = [];
      let finalOrgStructure: OrgStructure | undefined;
      let newEvents: ReconciliationEvent[] = [];
      setSettings((prev) => {
        const prevEventCount = (prev.reconciliationEvents ?? []).length;
        let next = prev;
        for (const link of links) {
          const result = applyUnlink(next, link.id, actingEmail, emp?.name ?? "This person");
          if (result.ok) {
            next = result.settings;
            reversedLinks.push(result.link);
          }
        }
        next = pruneEmployeeFromSettings(next, employeeId, userIdRef.current, emp);
        finalOrgStructure = next.orgStructure;
        newEvents = (next.reconciliationEvents ?? []).slice(prevEventCount);
        return next;
      });
      if (cloudSyncRef.current) {
        for (const link of reversedLinks) void upsertPersonLink(link);
        if (finalOrgStructure) void upsertOrgStructureRemote(finalOrgStructure);
        for (const e of newEvents) void upsertReconciliationEvent(e);
      }
    },
    [snapshot, settings, actingEmail]
  );

  const updateFundingSourceAlias = useCallback(
    (fundingSourceId: string, aliasBase: string) => {
      setSettings((prev) => {
        const fs = snapshot?.fundingSources.find((f) => f.id === fundingSourceId);
        const key = fs ? fundingSourceKey(fs) : fundingSourceId;
        const existing = prev.fundingSourceAliases[key] ?? prev.fundingSourceAliases[fundingSourceId];
        const nextEntry = {
          alias: aliasBase,
          notes: existing?.notes,
          color: existing?.color,
        };
        if (cloudSyncRef.current) {
          void upsertFundingSourceAlias({
            chartstringKey: key,
            alias: aliasBase,
            notes: existing?.notes,
            color: existing?.color,
          });
        }
        return {
          ...prev,
          fundingSourceAliases: {
            ...prev.fundingSourceAliases,
            [key]: nextEntry,
          },
        };
      });
    },
    [snapshot]
  );

  const setFundingSourceCategory = useCallback(
    (fundingSourceId: string, category: AccountCategory | null) => {
      const fs = snapshot?.fundingSources.find((f) => f.id === fundingSourceId);
      const key = fs ? fundingSourceKey(fs) : fundingSourceId;
      setSettings((prev) => {
        const categories = { ...(prev.fundingSourceCategories ?? {}) };
        if (category === null) delete categories[key];
        else categories[key] = category;
        return { ...prev, fundingSourceCategories: categories };
      });
      if (cloudSyncRef.current) {
        if (category === null) void deleteFundingSourceCategoryAssignmentRemote(key);
        else void upsertFundingSourceCategoryAssignment(key, category);
      }
    },
    [snapshot]
  );

  /**
   * Settings → Accounts assigns the type per account, which is the unit the
   * Net Position Report reports on. Writing the account key and dropping the
   * chartstrings beneath it keeps one account from ever showing two types.
   */
  const setFundingSourceCategoryForAccountKey = useCallback(
    (accountKey: string, category: AccountCategory | null) => {
      const root = normalizeChartstring(accountKey);
      // Same predicate setCategoryForAccountKey uses to drop the chartstrings
      // beneath this account — their remote rows must go too, or a re-fetch
      // would resurrect the very duplication this consolidates away.
      const affectedKeys = Object.keys(settings.fundingSourceCategories ?? {}).filter(
        (key) => normalizeChartstring(key) === root || chartstringFundDeptProject(key) === root
      );
      setSettings((prev) => ({
        ...prev,
        fundingSourceCategories: setCategoryForAccountKey(
          prev.fundingSourceCategories,
          accountKey,
          category
        ),
      }));
      if (cloudSyncRef.current) {
        for (const key of affectedKeys) void deleteFundingSourceCategoryAssignmentRemote(key);
        if (category !== null) void upsertFundingSourceCategoryAssignment(root, category);
      }
    },
    [settings.fundingSourceCategories]
  );

  const saveScenario = useCallback(
    (name: string) => {
      if (!snapshot || !workingPlan) return;
      const edited = workingPlan.allocations.filter((a) => a.status === "edited");
      setScenarios((prev) => [
        ...prev,
        {
          id: generateId(),
          name,
          createdAt: new Date().toISOString(),
          baseSnapshotId: snapshot.id,
          changes: edited.map((a) => ({
            employeeId: a.employeeId,
            fundingSourceId: a.fundingSourceId,
            month: a.month,
            percentEffort: a.percentEffort,
          })),
        },
      ]);
    },
    [snapshot, workingPlan]
  );

  const importNetPositionFiles = useCallback(
    async (files: File[]): Promise<ImportFilesResult> => {
      const warnings: ParseWarning[] = [];
      const fileResults: ImportFileResult[] = [];
      const imports: NetPositionReportImport[] = [];

      for (const file of files) {
        try {
          const result = await parseNetPositionFile(file);
          const status = parseStatusFromWarnings(result.warnings);
          imports.push({ ...result.import, parseStatus: status });
          fileResults.push({ fileName: file.name, status });
          warnings.push(...result.warnings);
        } catch (err) {
          fileResults.push({ fileName: file.name, status: "failed" });
          warnings.push({
            id: generateId(),
            severity: "error",
            message: `${file.name}: ${err instanceof Error ? err.message : "Parse failed"}`,
          });
        }
      }

      if (imports.length > 0) {
        setNetPositionImports((prev) => [...prev, ...imports]);
      }

      return { warnings, files: fileResults };
    },
    []
  );

  const removeNetPositionImport = useCallback((id: string) => {
    setNetPositionImports((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const importPositionSalaryFiles = useCallback(
    async (files: File[]): Promise<ImportFilesResult> => {
      const warnings: ParseWarning[] = [];
      const fileResults: ImportFileResult[] = [];
      const imports: PositionSalaryReportImport[] = [];

      for (const file of files) {
        try {
          const result = await parsePositionSalaryFile(file);
          const status = parseStatusFromWarnings(result.warnings);
          imports.push({ ...result.import, parseStatus: status });
          fileResults.push({ fileName: file.name, status });
          warnings.push(...result.warnings);
        } catch (err) {
          fileResults.push({ fileName: file.name, status: "failed" });
          warnings.push({
            id: generateId(),
            severity: "error",
            message: `${file.name}: ${err instanceof Error ? err.message : "Parse failed"}`,
          });
        }
      }

      if (imports.length > 0) {
        setPositionSalaryImports((prev) => {
          let next = [...prev];
          for (const incoming of imports) {
            if (incoming.fiscalYear) {
              next = next.filter((p) => p.fiscalYear !== incoming.fiscalYear);
            }
            next.push(incoming);
          }
          return next;
        });
      }

      return { warnings, files: fileResults };
    },
    []
  );

  const removePositionSalaryImport = useCallback((id: string) => {
    setPositionSalaryImports((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const removePayrollImport = useCallback(
    (id: string) => {
      const remaining = payrollImports.filter((p) => p.id !== id);
      setPayrollImports(remaining);
      const folded = foldPayrollImports(remaining);
      if (folded) {
        const refreshed = refreshFundingSourceColors(folded);
        setSnapshot(refreshed);
        setWorkingPlan({
          snapshotId: refreshed.id,
          allocations: refreshed.monthlyAllocations.map((a) => ({ ...a })),
          updatedAt: new Date().toISOString(),
        });
        // Removing an import re-folds the rest, which can reassign the
        // internal ids of people/funds that survive — re-attach every
        // stable-keyed setting to them here rather than waiting for the
        // next full reload to notice.
        setSettings((prev) =>
          migrateOverrideKeysForSnapshot(
            {
              ...prev,
              fundingSourceAliases: migrateAliasKeys(
                prev.fundingSourceAliases,
                refreshed.fundingSources
              ),
              fundingSourceCategories: migrateCategoryKeys(
                prev.fundingSourceCategories,
                refreshed.fundingSources
              ),
              employeeProfiles: rematchEmployeeProfiles(prev.employeeProfiles, refreshed.employees),
            },
            refreshed
          )
        );
      } else {
        setSnapshot(null);
        setWorkingPlan(null);
      }
    },
    [payrollImports]
  );

  const upsertPersonnelGroupDef = useCallback((group: PersonnelGroupDef) => {
    setSettings((prev) => {
      const groups = [...(prev.personnelGroups ?? [])];
      const idx = groups.findIndex((g) => g.id === group.id);
      if (idx >= 0) groups[idx] = group;
      else groups.push(group);
      return { ...prev, personnelGroups: groups };
    });
    if (cloudSyncRef.current) void upsertPersonnelGroup(group);
  }, []);

  const deletePersonnelGroupDef = useCallback((id: string) => {
    setSettings((prev) => {
      const groups = (prev.personnelGroups ?? []).filter((g) => g.id !== id);
      const employeePersonnelTypes = { ...(prev.employeePersonnelTypes ?? {}) };
      for (const [empId, type] of Object.entries(employeePersonnelTypes)) {
        if (type === id) delete employeePersonnelTypes[empId];
      }
      return { ...prev, personnelGroups: groups, employeePersonnelTypes };
    });
    if (cloudSyncRef.current) void deletePersonnelGroupRemote(id);
  }, []);

  const upsertFundingSourceTypeDef = useCallback((type: FundingSourceTypeDef) => {
    setSettings((prev) => {
      const types = [...(prev.fundingSourceTypes ?? [])];
      const idx = types.findIndex((t) => t.id === type.id);
      if (idx >= 0) types[idx] = type;
      else types.push(type);
      return { ...prev, fundingSourceTypes: types };
    });
    if (cloudSyncRef.current) void upsertFundingSourceType(type);
  }, []);

  const deleteFundingSourceTypeDef = useCallback((id: string) => {
    setSettings((prev) => {
      const types = (prev.fundingSourceTypes ?? []).filter((t) => t.id !== id);
      const fundingSourceCategories = { ...(prev.fundingSourceCategories ?? {}) };
      for (const [key, cat] of Object.entries(fundingSourceCategories)) {
        if (cat === id) delete fundingSourceCategories[key];
      }
      return { ...prev, fundingSourceTypes: types, fundingSourceCategories };
    });
    if (cloudSyncRef.current) void deleteFundingSourceTypeRemote(id);
  }, []);

  const upsertAccountGroupDef = useCallback((group: AccountGroupDef) => {
    setSettings((prev) => {
      const groups = [...(prev.accountGroups ?? [])];
      const idx = groups.findIndex((g) => g.id === group.id);
      if (idx >= 0) groups[idx] = group;
      else groups.push(group);
      return { ...prev, accountGroups: groups };
    });
    if (cloudSyncRef.current) void upsertAccountGroup(group);
  }, []);

  const deleteAccountGroupDef = useCallback((id: string) => {
    // Guarded here as well as in the UI: accounts carry this group to mean
    // "not mine" on Runway, Timeline and Projections, so removing it would
    // strand every marked account.
    if (UNDELETABLE_ACCOUNT_GROUP_IDS.includes(id)) return;
    setSettings((prev) => {
      const groups = (prev.accountGroups ?? []).filter((g) => g.id !== id);
      const accountGroupByBalanceKey = { ...(prev.accountGroupByBalanceKey ?? {}) };
      for (const [key, groupId] of Object.entries(accountGroupByBalanceKey)) {
        if (groupId === id) delete accountGroupByBalanceKey[key];
      }
      const accountGroupFilter = (prev.accountGroupFilter ?? []).filter((g) => g !== id);
      return { ...prev, accountGroups: groups, accountGroupByBalanceKey, accountGroupFilter };
    });
    if (cloudSyncRef.current) void deleteAccountGroupRemote(id);
  }, []);

  const setAccountGroupForBalanceKey = useCallback(
    (accountKey: string, groupId: string | null) => {
      const key = normalizeAccountBalanceKey(accountKey);
      setSettings((prev) => {
        const map = { ...(prev.accountGroupByBalanceKey ?? {}) };
        const wasNotMine = map[key] === NOT_MY_ACCOUNTS_GROUP_ID;
        if (groupId === null) delete map[key];
        else map[key] = groupId;

        /**
         * Assigning the group here is the same act as the landmark mark on Runway or
         * Timeline, so it must leave the account in the same state — including
         * the horizon. Without this, marking from Settings produced an account
         * with no end date until the next reload backfilled one, and in the
         * meantime it fell back to its real balance.
         */
        const isNowNotMine = groupId === NOT_MY_ACCOUNTS_GROUP_ID;
        if (!wasNotMine && !isNowNotMine) {
          return { ...prev, accountGroupByBalanceKey: map };
        }
        const endDates = { ...(prev.runwayAssumedEndDates ?? {}) };
        if (isNowNotMine) {
          if (!endDates[key]) {
            endDates[key] = defaultAssumedEndDate(
              prev.fiscalYearStartMonth,
              getProjectionOriginMonth()
            );
          }
        } else {
          delete endDates[key];
        }
        return { ...prev, accountGroupByBalanceKey: map, runwayAssumedEndDates: endDates };
      });

      if (cloudSyncRef.current) {
        if (groupId === null) void deleteAccountGroupAssignmentRemote(key);
        else void upsertAccountGroupAssignment(key, groupId);
      }
    },
    []
  );

  const setRunwayBalanceOverride = useCallback(
    (employeeId: string, chartstring: string, balance: number | null) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      const key = runwayOverrideKey(emp ? employeePersonKey(emp) : employeeId, chartstring);
      setSettings((prev) => {
        const overrides = { ...(prev.runwayBalanceOverrides ?? {}) };
        if (balance === null || Number.isNaN(balance)) {
          delete overrides[key];
        } else {
          const balanceByKey = new Map<string, number>();
          for (const [k, v] of accountBalances) {
            balanceByKey.set(k, v.balance);
          }
          const match = findBalanceForChartstring(chartstring, balanceByKey);
          if (match !== undefined && runwayBalanceValuesMatch(balance, match.balance)) {
            delete overrides[key];
          } else {
            overrides[key] = balance;
          }
        }
        return { ...prev, runwayBalanceOverrides: overrides };
      });
    },
    [accountBalances, snapshot]
  );

  const setRunwayBurnOverride = useCallback(
    (
      employeeId: string,
      fundingSourceId: string,
      percentEffort: number,
      monthlyBurn: number
    ) => {
      setSettings((prev) => {
        const overrides = { ...(prev.runwayBurnOverrides ?? {}) };
        if (!snapshot) return prev;

        const emp = snapshot.employees.find((e) => e.id === employeeId);
        const fs = snapshot.fundingSources.find((f) => f.id === fundingSourceId);
        const key = runwayBurnOverrideKey(
          emp ? employeePersonKey(emp) : employeeId,
          fs ? fundingSourceKey(fs) : fundingSourceId
        );

        const defaults = computePayrollBurnDefaults(
          employeeId,
          fundingSourceId,
          snapshot,
          getAllocations(snapshot, workingPlan),
          [getCurrentMonth(snapshot)]
        );
        const candidate = { percentEffort, monthlyBurn };
        if (runwayBurnValuesMatch(candidate, defaults)) {
          delete overrides[key];
        } else {
          overrides[key] = candidate;
        }
        return { ...prev, runwayBurnOverrides: overrides };
      });
    },
    [snapshot, workingPlan]
  );

  const clearRunwayBurnOverride = useCallback(
    (employeeId: string, fundingSourceId: string) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      const fs = snapshot?.fundingSources.find((f) => f.id === fundingSourceId);
      const key = runwayBurnOverrideKey(
        emp ? employeePersonKey(emp) : employeeId,
        fs ? fundingSourceKey(fs) : fundingSourceId
      );
      setSettings((prev) => {
        const overrides = { ...(prev.runwayBurnOverrides ?? {}) };
        delete overrides[key];
        return { ...prev, runwayBurnOverrides: overrides };
      });
    },
    [snapshot]
  );

  const addPlannedHire = useCallback(
    (plan: PlannedHire, rules: ProjectionRule[]) => {
      let newEvents: ReconciliationEvent[] = [];
      setSettings((prev) => {
        const prevEventCount = (prev.reconciliationEvents ?? []).length;
        const next = addPlannedHireToSettings(prev, plan, rules, actingEmail);
        newEvents = (next.reconciliationEvents ?? []).slice(prevEventCount);
        return next;
      });
      if (cloudSyncRef.current) {
        void upsertPlannedHire(plan);
        for (const e of newEvents) void upsertReconciliationEvent(e);
      }
    },
    [actingEmail]
  );

  const updatePlannedHire = useCallback(
    (id: string, patch: Partial<Omit<PlannedHire, "id" | "createdAt" | "createdBy">>) => {
      const current = plannedHireById(settings.plannedHires, id);
      setSettings((prev) => updatePlannedHireInSettings(prev, id, patch));
      if (cloudSyncRef.current && current) void upsertPlannedHire({ ...current, ...patch });
    },
    [settings.plannedHires]
  );

  const removePlannedHire = useCallback(
    (id: string) => {
      // Checked against the settings this closure sees so the refusal can be
      // returned; the updater re-runs the same pure transform.
      const check = removePlannedHireFromSettings(settings, id, actingEmail);
      if (!check.ok) return { ok: false, reason: check.reason };
      let newEvents: ReconciliationEvent[] = [];
      setSettings((prev) => {
        const prevEventCount = (prev.reconciliationEvents ?? []).length;
        const result = removePlannedHireFromSettings(prev, id, actingEmail);
        newEvents = (result.settings.reconciliationEvents ?? []).slice(prevEventCount);
        return result.settings;
      });
      if (cloudSyncRef.current) {
        void deletePlannedHireRemote(id);
        for (const e of newEvents) void upsertReconciliationEvent(e);
      }
      return { ok: true };
    },
    [settings, actingEmail]
  );

  /**
   * Confirm a link: identity row + finance choice + event, then copy the
   * plan's team, start and scope onto the person only where blank — through
   * the same setters the roster uses, so the cloud roster row follows. What
   * was copied rides on the link so Unlink can remove exactly that.
   */
  const linkPlannedHire = useCallback(
    (input: {
      plannedHireId: string;
      employeePersonKey: string;
      basis: "suggested" | "manual";
      signals: string[];
      choice: Pick<ReconciliationChoice, "forecastRate" | "pinPlannedRate" | "distribution">;
    }) => {
      const plan = plannedHireById(settings.plannedHires, input.plannedHireId);
      const emp = snapshotForUi
        ? findEmployeeByPersonKey(snapshotForUi.employees, input.employeePersonKey)
        : undefined;
      if (!plan) return { ok: false, reason: "This plan no longer exists." };
      if (!emp) return { ok: false, reason: "That person is not on the current payroll report." };
      // A start date before payroll's first posted month would zero the
      // months the person was actually paid, so the plan's start is copied
      // only when payroll does not already say otherwise.
      const firstPosted = snapshotForUi ? firstChargedMonth(snapshotForUi, emp.id) : null;
      const copied = {
        team: Boolean(plan.teamId && !getEmployeePersonnelType(settings, emp.id)),
        startDate:
          !getEmployeeStartDate(settings, emp.id, emp) &&
          (firstPosted === null || firstPosted >= plan.startMonth),
        scope:
          plan.appointmentPercent > 0 &&
          plan.appointmentPercent !== emp.appointmentPercent &&
          settings.employeePlanningScope?.[emp.id] === undefined,
      };
      const linkInput: LinkInput = {
        ...input,
        employeeName: emp.name,
        copied,
        by: actingEmail,
        originMonth: getProjectionOriginMonth(),
      };
      const check = applyLink(settings, linkInput);
      if (!check.ok) return { ok: false, reason: check.reason };
      // applyLink generates a fresh id/timestamp on every call, so the link
      // actually committed to state can differ from `check.link` above —
      // capture it from inside the updater rather than re-deriving it.
      let committedLink: PersonLink | null = null;
      let committedChoice: ReconciliationChoice | null = null;
      let newEvents: ReconciliationEvent[] = [];
      setSettings((prev) => {
        const prevEventCount = (prev.reconciliationEvents ?? []).length;
        const linked = applyLink(prev, linkInput);
        if (!linked.ok) return prev;
        committedLink = linked.link;
        committedChoice = linked.choice;
        // A closed full month may already exist: then the closed-month rate
        // is in force from the first forecast month and the link's rate row
        // says so, so no later import can record a switch that never happened.
        const atLink = snapshotForUi
          ? rateAtLinkEvent({
              plan,
              employee: emp,
              snapshot: snapshotForUi,
              linkId: linked.link.id,
              choice: linked.choice,
              by: actingEmail,
            })
          : null;
        const finalSettings = atLink ? appendEvents(linked.settings, [atLink]) : linked.settings;
        newEvents = (finalSettings.reconciliationEvents ?? []).slice(prevEventCount);
        return finalSettings;
      });
      if (cloudSyncRef.current) {
        if (committedLink) void upsertPersonLink(committedLink);
        if (committedChoice) void upsertReconciliationChoice(committedChoice);
        for (const e of newEvents) void upsertReconciliationEvent(e);
      }
      if (copied.team && plan.teamId) setEmployeePersonnelType(emp.id, plan.teamId);
      if (copied.startDate) setEmployeeStartDate(emp.id, `${plan.startMonth}-01`);
      if (copied.scope) setEmployeePlanningScope(emp.id, plan.appointmentPercent);
      return { ok: true };
    },
    [
      settings,
      snapshotForUi,
      actingEmail,
      setEmployeePersonnelType,
      setEmployeeStartDate,
      setEmployeePlanningScope,
    ]
  );

  const unlinkPlannedHire = useCallback(
    (linkId: string) => {
      const link = (settings.personLinks ?? []).find((l) => l.id === linkId && !l.reversedAt);
      const plan = link ? plannedHireById(settings.plannedHires, link.plannedHireId) : undefined;
      const emp =
        link && snapshotForUi
          ? findEmployeeByPersonKey(snapshotForUi.employees, link.employeePersonKey)
          : undefined;
      const employeeName = emp?.name ?? link?.employeePersonKey ?? "This person";
      const check = applyUnlink(settings, linkId, actingEmail, employeeName);
      if (!check.ok) return { ok: false, reason: check.reason };
      // Same non-determinism as applyLink (fresh reversedAt each call) — read
      // the reversed link that actually landed in state, not `check.link`.
      let reversedLink: PersonLink | null = null;
      let newEvents: ReconciliationEvent[] = [];
      setSettings((prev) => {
        const prevEventCount = (prev.reconciliationEvents ?? []).length;
        const unlinked = applyUnlink(prev, linkId, actingEmail, employeeName);
        if (!unlinked.ok) return prev;
        reversedLink = unlinked.link;
        newEvents = (unlinked.settings.reconciliationEvents ?? []).slice(prevEventCount);
        return unlinked.settings;
      });
      if (cloudSyncRef.current) {
        if (reversedLink) void upsertPersonLink(reversedLink);
        for (const e of newEvents) void upsertReconciliationEvent(e);
      }
      // Remove only what Confirm copied, and only while it still says what
      // the plan said — anything the PI typed since stays.
      if (emp && plan && link?.copied) {
        if (link.copied.team && getEmployeePersonnelType(settings, emp.id) === plan.teamId) {
          setEmployeePersonnelType(emp.id, null);
        }
        if (
          link.copied.startDate &&
          getEmployeeStartDate(settings, emp.id, emp) === `${plan.startMonth}-01`
        ) {
          setEmployeeStartDate(emp.id, null);
        }
        if (
          link.copied.scope &&
          settings.employeePlanningScope?.[emp.id] === plan.appointmentPercent
        ) {
          setEmployeePlanningScope(emp.id, null);
        }
      }
      return { ok: true };
    },
    [
      settings,
      snapshotForUi,
      actingEmail,
      setEmployeePersonnelType,
      setEmployeeStartDate,
      setEmployeePlanningScope,
    ]
  );

  const dismissMatch = useCallback(
    (plannedHireId: string, personKey: string) => {
      const emp = snapshotForUi
        ? findEmployeeByPersonKey(snapshotForUi.employees, personKey)
        : undefined;
      const name = emp?.name ?? personKey;
      // applyDismissal is a no-op (same array reference) when this pair was
      // already dismissed, so only sync when a new row actually landed.
      let newDismissal: MatchDismissal | null = null;
      let newEvents: ReconciliationEvent[] = [];
      setSettings((prev) => {
        const prevEventCount = (prev.reconciliationEvents ?? []).length;
        const next = applyDismissal(prev, plannedHireId, personKey, name, actingEmail);
        if (next.matchDismissals !== prev.matchDismissals) {
          newDismissal = next.matchDismissals?.at(-1) ?? null;
          newEvents = (next.reconciliationEvents ?? []).slice(prevEventCount);
        }
        return next;
      });
      if (cloudSyncRef.current) {
        if (newDismissal) void upsertMatchDismissal(newDismissal);
        for (const e of newEvents) void upsertReconciliationEvent(e);
      }
    },
    [snapshotForUi, actingEmail]
  );

  const setPinPlannedRate = useCallback(
    (linkId: string, pinned: boolean) => {
      const current = (settings.reconciliationChoices ?? []).find((c) => c.linkId === linkId);
      setSettings((prev) => setPinPlannedRateInSettings(prev, linkId, pinned));
      if (cloudSyncRef.current && current) {
        void upsertReconciliationChoice({ ...current, pinPlannedRate: pinned });
      }
    },
    [settings.reconciliationChoices]
  );

  const clearAll = useCallback(() => {
    setSettings((prev) => {
      /**
       * Clear what the confirmation promises to clear, and nothing else.
       *
       * This used to rebuild settings from DEFAULT_SETTINGS plus a list of
       * fields to carry over, which silently dropped anything absent from that
       * list — including the "fund ends" dates, whose accounts stayed marked
       * "not my account" and were quietly refilled with fiscal year end on the
       * next load, and the planning defaults that date is derived from.
       *
       * Starting from `prev` inverts it: a setting added later survives a
       * clear unless someone deliberately adds it here.
       */
      const keptSettings: AppSettings = {
        ...prev,
        hiddenEmployeeFunds: DEFAULT_SETTINGS.hiddenEmployeeFunds,
        employeePlanningScope: DEFAULT_SETTINGS.employeePlanningScope,
      };
      // Never write a delegated workspace's state into the analyst's own
      // local slot; the cloud save effect propagates the clear to the PI.
      if (!actingAsDelegate) {
        void saveState(
          {
            snapshot: null,
            workingPlan: null,
            scenarios: [],
            settings: keptSettings,
            payrollImports: [],
            netPositionImports,
            positionSalaryImports,
          },
          userIdRef.current
        );
      }
      return keptSettings;
    });
    setSnapshot(null);
    setWorkingPlan(null);
    setScenarios([]);
    setPayrollImports([]);
    setDataMigrated(false);
  }, [netPositionImports, positionSalaryImports, actingAsDelegate]);

  const value: AppContextValue = {
    snapshot: snapshotForUi,
    workingPlan,
    allocations,
    settings,
    scenarios,
    loading,
    dataMigrated,
    hasData: !!snapshot && snapshot.parseStatus !== "failed",
    importPayrollFiles,
    resetToImported,
    updateAllocation,
    updateSettings,
    upsertProjectionRule,
    removeProjectionRule,
    addPlannedFundingSource,
    setProjectionHorizon,
    removeChartstringFromProjections,
    updateFundingSourceAlias,
    setFundingSourceCategory,
    setFundingSourceCategoryForAccountKey,
    toggleHiddenEmployeeFund,
    toggleNotMyAccount,
    setRunwayAssumedEndDate,
    unhideEmployeeFunds,
    unhideAllEmployeeFunds,
    setEmployeePlanningScope,
    setEmployeePersonnelType,
    setEmployeePhotoUrl,
    importOcrPeoplePhotos,
    setEmployeeStartDate,
    setEmployeeEndDate,
    uploadEmployeeOfferLetter,
    viewEmployeeOfferLetter,
    removeEmployeeOfferLetter,
    setEmployeeHidden,
    setEmployeeAlumni,
    deleteEmployee,
    setOrgStructure,
    saveScenario,
    clearAll,
    fundingSources,
    accountTitlesByChartstring,
    payrollImports,
    netPositionImports,
    positionSalaryImports,
    accountBalances,
    hiddenAccountKeys,
    importNetPositionFiles,
    removeNetPositionImport,
    importPositionSalaryFiles,
    removePositionSalaryImport,
    removePayrollImport,
    upsertPersonnelGroupDef,
    deletePersonnelGroupDef,
    upsertFundingSourceTypeDef,
    deleteFundingSourceTypeDef,
    upsertAccountGroupDef,
    deleteAccountGroupDef,
    setAccountGroupForBalanceKey,
    setRunwayBalanceOverride,
    setRunwayBurnOverride,
    clearRunwayBurnOverride,
    reconciliation,
    actingEmail,
    addPlannedHire,
    updatePlannedHire,
    removePlannedHire,
    linkPlannedHire,
    unlinkPlannedHire,
    dismissMatch,
    setPinPlannedRate,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
