"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountCategory,
  AccountGroupDef,
  PersonnelType,
  AppSettings,
  FundingSourceTypeDef,
  MonthlyAllocation,
  OrgStructure,
  ParsePreview,
  ParseWarning,
  PayrollReportImport,
  PayrollReportSnapshot,
  PersonnelGroupDef,
  PortfolioReportImport,
  NetPositionReportImport,
  Scenario,
  WorkingPlan,
  PositionSalaryReportImport,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { generateId, hasPercentEffort } from "@/lib/utils/parse";
import { loadStateForAccount, saveState } from "@/lib/storage/localStorage";
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
import { parseMyPortfolioFile } from "@/lib/parsers/myPortfolioParser";
import { parseNetPositionFile } from "@/lib/parsers/netPositionParser";
import { parsePositionSalaryFile } from "@/lib/parsers/positionSalaryParser";
import { overlayPositionSalaryOnSnapshot } from "@/lib/employees/positionSalary";
import { mergeAccountBalances, mergePortfolioBalances } from "@/lib/portfolio/mergeBalances";
import { chartstringFundDeptProject, findPortfolioTitleForChartstring } from "@/lib/funding/chartstring";
import {
  computePayrollBurnDefaults,
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
import { employeePersonKey, rematchEmployeeProfiles, resolveEmployeeProfile } from "@/lib/employees/stableKey";
import {
  OFFER_LETTER_MAX_BYTES,
  parseOfferLetterFile,
} from "@/lib/employees/offerLetterParse";
import { migrateCategoryKeys } from "@/lib/funding/accountCategory";
import {
  migrateAssumedOkToAccountGroups,
} from "@/lib/net-position/accountGroup";
import {
  NOT_MY_ACCOUNTS_GROUP_ID,
  UNDELETABLE_ACCOUNT_GROUP_IDS,
} from "@/lib/catalog/defaults";
import { backfillAssumedEndDates, defaultAssumedEndDate } from "@/lib/runway/assumedEndDate";
import { getProjectionOriginMonth } from "@/lib/projections/horizon";
import {
  deleteOfferLetterFile,
  getOfferLetterFile,
  saveOfferLetterFile,
} from "@/lib/storage/offerLetterStore";
import { useAuth } from "@/context/AuthContext";
import { parseStorageRef } from "@/lib/supabase/signedUrl";
import {
  deleteEmployeeOfferLetterFile,
  fetchRemoteAliases,
  fetchRemoteRosterMeta,
  mergeRemoteSettings,
  openOfferLetterFromCloud,
  upsertEmployeePhoto,
  upsertEmployeeRosterMeta,
  upsertFundingSourceAlias,
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
  claimLegacyCloudWorkspace,
  fetchCloudWorkspace,
  pickWorkspace,
  saveCloudWorkspace,
  workspaceHasPlanningData,
} from "@/lib/supabase/workspace";
import { isLabOwnerEmail } from "@/lib/supabase/labOwner";

interface AppContextValue {
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  allocations: MonthlyAllocation[];
  settings: AppSettings;
  scenarios: Scenario[];
  loading: boolean;
  pendingPreview: ParsePreview | null;
  pendingSnapshot: PayrollReportSnapshot | null;
  pendingMergeInfo: { overwrittenMonths: string[]; preservedMonths: string[]; isMerge: boolean } | null;
  dataMigrated: boolean;
  hasData: boolean;
  parsePayrollFiles: (files: File[]) => Promise<{ warnings: ParseWarning[] }>;
  parseFile: (file: File) => Promise<{ warnings: ParseWarning[] }>;
  confirmImport: () => void;
  cancelImport: () => void;
  resetToImported: () => void;
  updateAllocation: (
    employeeId: string,
    fundingSourceId: string,
    month: string,
    percentEffort: number
  ) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  updateFundingSourceAlias: (fundingSourceId: string, aliasBase: string) => void;
  setFundingSourceCategory: (fundingSourceId: string, category: AccountCategory | null) => void;
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
  portfolioTitlesByChartstring: Map<string, string>;
  portfolioImports: PortfolioReportImport[];
  payrollImports: PayrollReportImport[];
  netPositionImports: NetPositionReportImport[];
  positionSalaryImports: PositionSalaryReportImport[];
  mergedPortfolioBalances: ReturnType<typeof mergePortfolioBalances>;
  /** Explicit hides + accounts hidden on Runway for everyone, minus explicit reveals. */
  hiddenAccountKeys: string[];
  parsePortfolioFile: (file: File) => Promise<{ warnings: ParseWarning[] }>;
  importPortfolioFiles: (files: File[]) => Promise<{ warnings: ParseWarning[] }>;
  removePortfolioImport: (id: string) => void;
  importNetPositionFiles: (files: File[]) => Promise<{ warnings: ParseWarning[] }>;
  removeNetPositionImport: (id: string) => void;
  importPositionSalaryFiles: (files: File[]) => Promise<{ warnings: ParseWarning[] }>;
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
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PayrollReportSnapshot | null>(null);
  const [workingPlan, setWorkingPlan] = useState<WorkingPlan | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingPreview, setPendingPreview] = useState<ParsePreview | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<PayrollReportSnapshot | null>(null);
  const [pendingMergeInfo, setPendingMergeInfo] = useState<{
    overwrittenMonths: string[];
    preservedMonths: string[];
    isMerge: boolean;
  } | null>(null);
  const [dataMigrated, setDataMigrated] = useState(false);
  const [portfolioImports, setPortfolioImports] = useState<PortfolioReportImport[]>([]);
  const [payrollImports, setPayrollImports] = useState<PayrollReportImport[]>([]);
  const [netPositionImports, setNetPositionImports] = useState<NetPositionReportImport[]>([]);
  const [positionSalaryImports, setPositionSalaryImports] = useState<PositionSalaryReportImport[]>([]);
  const [pendingPayrollImports, setPendingPayrollImports] = useState<PayrollReportImport[]>([]);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { ready: authReady, cloudSyncEnabled, user } = useAuth();
  const userId = user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const cloudSyncRef = useRef(cloudSyncEnabled);
  cloudSyncRef.current = cloudSyncEnabled;

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setLoading(true);

    async function hydrateLocal(s: Awaited<ReturnType<typeof loadStateForAccount>>) {
      setPortfolioImports(s.portfolioImports ?? []);
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

      // Order matters: lift any old per-person "not my account" marks onto
      // their account first, then give every marked account a horizon. Running
      // the backfill first would key dates against a store about to be retired.
      settingsLocal = migrateAssumedOkToAccountGroups(settingsLocal, (fundingSourceId) => {
        const fs = s.snapshot?.fundingSources.find((f) => f.id === fundingSourceId);
        if (!fs) return null;
        return chartstringFundDeptProject(fs.accountString ?? fs.rawName);
      });
      settingsLocal = {
        ...settingsLocal,
        // Workspaces saved before the end date became required can hold
        // accounts marked "not my account" with no horizon; those would keep
        // reading as infinite runway until touched by hand.
        runwayAssumedEndDates: backfillAssumedEndDates(
          Object.entries(settingsLocal.accountGroupByBalanceKey ?? {})
            .filter(([, groupId]) => groupId === NOT_MY_ACCOUNTS_GROUP_ID)
            .map(([key]) => key),
          settingsLocal.runwayAssumedEndDates,
          settingsLocal.fiscalYearStartMonth,
          getProjectionOriginMonth()
        ),
      };

      if (cancelled) return;

      let snap = s.snapshot ? refreshFundingSourceColors(s.snapshot) : null;
      let plan = s.workingPlan;
      if (snap) {
        const migrated = migrateSnapshotIfNeeded(snap, plan);
        snap = refreshFundingSourceColors(migrated.snapshot);
        plan = migrated.workingPlan;
        setDataMigrated(migrated.migrated);
      }
      setPayrollImports(ensurePayrollImports(snap, s.payrollImports));
      setSnapshot(snap);
      setWorkingPlan(plan);
      setSettings(settingsLocal);
      setScenarios(s.scenarios);
      setLoading(false);
    }

    async function hydrate() {
      const ownerEmail = user?.email ?? (user?.user_metadata?.email as string | undefined);
      const s = await loadStateForAccount(userId, ownerEmail);

      if (!cloudSyncEnabled) {
        await hydrateLocal(s);
        return;
      }

      let cloud = await fetchCloudWorkspace();
      if (!workspaceHasPlanningData(cloud ?? {}) && isLabOwnerEmail(ownerEmail)) {
        cloud = (await claimLegacyCloudWorkspace(ownerEmail)) ?? cloud;
      }

      const [remoteAliases, remoteRoster] = await Promise.all([
        fetchRemoteAliases(),
        fetchRemoteRosterMeta(),
      ]);
      if (cancelled) return;
      const workspace = pickWorkspace(s, cloud);

      // Persist recovered lab data into the owner browser slot immediately.
      if (userId && workspaceHasPlanningData(workspace) && !workspaceHasPlanningData(s)) {
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
        workspace.snapshot?.employees ?? []
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

      settingsLocal = await syncCatalogFromCloud(settingsLocal);

      let snap = workspace.snapshot ? refreshFundingSourceColors(workspace.snapshot) : null;
      let plan = workspace.workingPlan;
      if (snap) {
        const migrated = migrateSnapshotIfNeeded(snap, plan);
        snap = refreshFundingSourceColors(migrated.snapshot);
        plan = migrated.workingPlan;
        setDataMigrated(migrated.migrated);
      }
      if (cancelled) return;
      setPortfolioImports(workspace.portfolioImports ?? []);
      setNetPositionImports(workspace.netPositionImports ?? []);
      setPositionSalaryImports(workspace.positionSalaryImports ?? []);
      setPayrollImports(ensurePayrollImports(snap, workspace.payrollImports));
      setSnapshot(snap);
      setWorkingPlan(plan);
      setSettings(settingsLocal);
      setScenarios(workspace.scenarios ?? []);
      setLoading(false);
      if (snap) void backfillOfferLettersToCloud(snap.employees, settingsLocal);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [authReady, cloudSyncEnabled, userId, user?.email, user?.user_metadata?.email]);

  useEffect(() => {
    if (loading) return;
    const savedAt = new Date().toISOString();
    const state = {
      snapshot,
      workingPlan,
      scenarios,
      settings,
      portfolioImports,
      payrollImports,
      netPositionImports,
      positionSalaryImports,
      savedAt,
    };
    void saveState(state, userIdRef.current);
    if (!cloudSyncRef.current) return;
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = setTimeout(() => {
      if (!cloudSyncRef.current) return;
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
    portfolioImports,
    payrollImports,
    netPositionImports,
    positionSalaryImports,
    loading,
    cloudSyncEnabled,
    userId,
  ]);

  // Both report types, not just MyPortfolio — Runway resolves every balance
  // through this map, so anything missing here is treated as $0.
  const mergedPortfolioBalances = useMemo(
    () => mergeAccountBalances(portfolioImports, netPositionImports),
    [portfolioImports, netPositionImports]
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
    const pairs: { employeeId: string; fundingSourceId: string; accountKey: string }[] = [];
    for (const emp of snapshot.employees) {
      for (const fs of snapshot.fundingSources) {
        if (!isAccountActiveInMonth(emp.id, fs.id, currentMonth, snapshot, currentAllocations)) continue;
        const accountKey = normalizeAccountBalanceKey(
          chartstringFundDeptProject(fs.accountString ?? fs.rawName) ?? fs.accountString ?? fs.rawName
        );
        pairs.push({ employeeId: emp.id, fundingSourceId: fs.id, accountKey });
      }
    }
    return effectiveHiddenAccountKeys(settings, accountsHiddenForEveryone(pairs, settings));
  }, [snapshot, workingPlan, settings]);

  const portfolioTitlesByChartstring = useMemo(() => {
    const map = new Map<string, string>();
    if (!snapshot) return map;
    for (const fs of snapshot.fundingSources) {
      if (!fs.accountString) continue;
      const title = findPortfolioTitleForChartstring(
        fs.accountString,
        mergedPortfolioBalances
      );
      if (title) map.set(fs.accountString, title);
    }
    return map;
  }, [snapshot, mergedPortfolioBalances]);

  const allocations = useMemo(
    () => (snapshot ? getAllocations(snapshot, workingPlan) : []),
    [snapshot, workingPlan]
  );

  const fundingSources = useMemo(
    () =>
      snapshot
        ? applyAliases(
            snapshot.fundingSources,
            settings.fundingSourceAliases,
            portfolioTitlesByChartstring
          )
        : [],
    [snapshot, settings.fundingSourceAliases, portfolioTitlesByChartstring]
  );

  const parsePayrollFiles = useCallback(
    async (files: File[]): Promise<{ warnings: ParseWarning[] }> => {
      const warnings: ParseWarning[] = [];
      const incomingImports: PayrollReportImport[] = [];
      let merged = snapshot;
      const overwritten = new Set<string>();
      let isMerge = false;
      let lastPreview: ParsePreview | null = null;

      for (const file of files) {
        try {
          const wb = await readWorkbook(file);
          const { snapshot: incoming, preview } = parsePayrollFundingWorkbook(wb, file.name);
          warnings.push(...preview.warnings);
          incomingImports.push(payrollImportFromSnapshot(incoming));
          const merge = mergePayrollSnapshots(merged, incoming);
          merge.overwrittenMonths.forEach((m) => overwritten.add(m));
          if (merge.isMerge) isMerge = true;
          merged = merge.snapshot;
          lastPreview = preview;
        } catch (err) {
          warnings.push({
            id: generateId(),
            severity: "error",
            message: `${file.name}: ${err instanceof Error ? err.message : "Parse failed"}`,
          });
        }
      }

      if (!merged || incomingImports.length === 0) {
        return { warnings };
      }

      const existingMonths = new Set<string>();
      if (snapshot) {
        snapshot.monthlyAllocations.forEach((a) => existingMonths.add(a.month));
        snapshot.monthlyCosts.forEach((c) => existingMonths.add(c.month));
      }
      const preservedMonths = [...existingMonths].filter((m) => !overwritten.has(m)).sort();

      setPendingPayrollImports(incomingImports);
      setPendingSnapshot(merged);
      setPendingMergeInfo({
        overwrittenMonths: [...overwritten].sort(),
        preservedMonths,
        isMerge,
      });
      setPendingPreview(lastPreview);

      return { warnings };
    },
    [snapshot]
  );

  const parseFile = useCallback(
    (file: File) => parsePayrollFiles([file]),
    [parsePayrollFiles]
  );

  const confirmImport = useCallback(() => {
    if (!pendingSnapshot) return;

    const overwriteMonths = new Set(pendingMergeInfo?.overwrittenMonths ?? []);

    setSettings((prev) => ({
      ...prev,
      fundingSourceAliases: migrateAliasKeys(
        prev.fundingSourceAliases,
        pendingSnapshot.fundingSources
      ),
      fundingSourceCategories: migrateCategoryKeys(
        prev.fundingSourceCategories,
        pendingSnapshot.fundingSources
      ),
      employeeProfiles: rematchEmployeeProfiles(
        prev.employeeProfiles,
        pendingSnapshot.employees
      ),
    }));

    setSnapshot(refreshFundingSourceColors(pendingSnapshot));

    setWorkingPlan((prev) => {
      const mergedAllocs = pendingMergeInfo?.isMerge
        ? mergeWorkingPlanAllocations(prev?.allocations, pendingSnapshot, overwriteMonths)
        : pendingSnapshot.monthlyAllocations.map((a) => ({ ...a }));

      return {
        snapshotId: pendingSnapshot.id,
        allocations: mergedAllocs,
        updatedAt: new Date().toISOString(),
      };
    });

    if (pendingPayrollImports.length > 0) {
      setPayrollImports((prev) => [...prev, ...pendingPayrollImports]);
    }
    setPendingPayrollImports([]);
    setPendingSnapshot(null);
    setPendingPreview(null);
    setPendingMergeInfo(null);
  }, [pendingSnapshot, pendingMergeInfo, pendingPayrollImports]);

  const cancelImport = useCallback(() => {
    setPendingSnapshot(null);
    setPendingPreview(null);
    setPendingMergeInfo(null);
    setPendingPayrollImports([]);
  }, []);

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

  const toggleHiddenEmployeeFund = useCallback((employeeId: string, fundingSourceId: string) => {
    const key = hiddenFundKey(employeeId, fundingSourceId);
    setSettings((prev) => {
      const hidden = new Set(prev.hiddenEmployeeFunds ?? []);
      if (hidden.has(key)) hidden.delete(key);
      else hidden.add(key);
      return { ...prev, hiddenEmployeeFunds: [...hidden] };
    });
  }, []);

  /**
   * "Not my account" is a property of the account, so the shield writes the
   * account group — the single place it is stored. Marking from Runway or the
   * timeline and assigning the group in Settings are the same action.
   */
  const toggleNotMyAccount = useCallback((chartstring: string) => {
    setSettings((prev) => {
      const root = chartstringFundDeptProject(chartstring) ?? chartstring;
      const key = normalizeAccountBalanceKey(root);

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
  }, []);

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

  const unhideEmployeeFunds = useCallback((employeeId: string) => {
    setSettings((prev) => ({
      ...prev,
      hiddenEmployeeFunds: withoutHiddenFundsForEmployee(prev.hiddenEmployeeFunds ?? [], employeeId),
    }));
  }, []);

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
      await saveOfferLetterFile({
        employeeId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        uploadedAt,
        blob: file,
      });
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
    [patchEmployeeProfile, pushRosterCloud, snapshot]
  );

  const viewEmployeeOfferLetter = useCallback(async (employeeId: string) => {
    const stored = await getOfferLetterFile(employeeId);
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
  }, [snapshot, settings]);

  const removeEmployeeOfferLetter = useCallback(
    async (employeeId: string) => {
      const emp = snapshot?.employees.find((e) => e.id === employeeId);
      const existing = emp
        ? resolveEmployeeProfile(settings, emp)?.offerLetter
        : settings.employeeProfiles?.[employeeId]?.offerLetter;
      await deleteOfferLetterFile(employeeId);
      if (existing?.storagePath && cloudSyncRef.current) {
        await deleteEmployeeOfferLetterFile(existing.storagePath);
      }
      patchEmployeeProfile(employeeId, (current) => {
        delete current.offerLetter;
      });
      pushRosterCloud(employeeId, { offerLetter: null });
    },
    [patchEmployeeProfile, pushRosterCloud, snapshot, settings]
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
  }, []);

  const deleteEmployee = useCallback((employeeId: string) => {
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
    setSettings((prev) => pruneEmployeeFromSettings(prev, employeeId));
  }, []);

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
      setSettings((prev) => {
        const fs = snapshot?.fundingSources.find((f) => f.id === fundingSourceId);
        const key = fs ? fundingSourceKey(fs) : fundingSourceId;
        const categories = { ...(prev.fundingSourceCategories ?? {}) };
        if (category === null) delete categories[key];
        else categories[key] = category;
        return { ...prev, fundingSourceCategories: categories };
      });
    },
    [snapshot]
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

  const importPortfolioFiles = useCallback(async (files: File[]) => {
    const warnings: ParseWarning[] = [];
    const imports: PortfolioReportImport[] = [];

    for (const file of files) {
      try {
        const result = await parseMyPortfolioFile(file);
        imports.push(result.import);
        warnings.push(...result.warnings);
      } catch (err) {
        warnings.push({
          id: generateId(),
          severity: "error",
          message: `${file.name}: ${err instanceof Error ? err.message : "Parse failed"}`,
        });
      }
    }

    if (imports.length > 0) {
      setPortfolioImports((prev) => [...prev, ...imports]);
    }

    return { warnings };
  }, []);

  const parsePortfolioFile = useCallback(
    async (file: File) => importPortfolioFiles([file]),
    [importPortfolioFiles]
  );

  const removePortfolioImport = useCallback((id: string) => {
    setPortfolioImports((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const importNetPositionFiles = useCallback(async (files: File[]) => {
    const warnings: ParseWarning[] = [];
    const imports: NetPositionReportImport[] = [];

    for (const file of files) {
      try {
        const result = await parseNetPositionFile(file);
        imports.push(result.import);
        warnings.push(...result.warnings);
      } catch (err) {
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

    return { warnings };
  }, []);

  const removeNetPositionImport = useCallback((id: string) => {
    setNetPositionImports((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const importPositionSalaryFiles = useCallback(async (files: File[]) => {
    const warnings: ParseWarning[] = [];
    const imports: PositionSalaryReportImport[] = [];

    for (const file of files) {
      try {
        const result = await parsePositionSalaryFile(file);
        imports.push(result.import);
        warnings.push(...result.warnings);
      } catch (err) {
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

    return { warnings };
  }, []);

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
         * Assigning the group here is the same act as the shield on Runway or
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
    },
    []
  );

  const setRunwayBalanceOverride = useCallback(
    (employeeId: string, chartstring: string, balance: number | null) => {
      const key = runwayOverrideKey(employeeId, chartstring);
      setSettings((prev) => {
        const overrides = { ...(prev.runwayBalanceOverrides ?? {}) };
        if (balance === null || Number.isNaN(balance)) {
          delete overrides[key];
        } else {
          const portfolioBalances = new Map<string, number>();
          for (const [k, v] of mergedPortfolioBalances) {
            portfolioBalances.set(k, v.balance);
          }
          const match = findBalanceForChartstring(chartstring, portfolioBalances);
          if (match !== undefined && runwayBalanceValuesMatch(balance, match.balance)) {
            delete overrides[key];
          } else {
            overrides[key] = balance;
          }
        }
        return { ...prev, runwayBalanceOverrides: overrides };
      });
    },
    [mergedPortfolioBalances]
  );

  const setRunwayBurnOverride = useCallback(
    (
      employeeId: string,
      fundingSourceId: string,
      percentEffort: number,
      monthlyBurn: number
    ) => {
      const key = runwayBurnOverrideKey(employeeId, fundingSourceId);
      setSettings((prev) => {
        const overrides = { ...(prev.runwayBurnOverrides ?? {}) };
        if (!snapshot) return prev;

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

  const clearRunwayBurnOverride = useCallback((employeeId: string, fundingSourceId: string) => {
    const key = runwayBurnOverrideKey(employeeId, fundingSourceId);
    setSettings((prev) => {
      const overrides = { ...(prev.runwayBurnOverrides ?? {}) };
      delete overrides[key];
      return { ...prev, runwayBurnOverrides: overrides };
    });
  }, []);

  const clearAll = useCallback(() => {
    setSettings((prev) => {
      const keptSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        fundingSourceAliases: prev.fundingSourceAliases,
        fundingSourceCategories: prev.fundingSourceCategories ?? {},
        employeeProfiles: prev.employeeProfiles ?? {},
        runwayBalanceOverrides: prev.runwayBalanceOverrides,
        runwayBurnOverrides: prev.runwayBurnOverrides,
        projectionHorizon: prev.projectionHorizon,
        plannedFundingSources: prev.plannedFundingSources,
        projectionRules: prev.projectionRules,
        projectionIgnoreRosterEndDates: prev.projectionIgnoreRosterEndDates,
        personnelGroups: prev.personnelGroups,
        fundingSourceTypes: prev.fundingSourceTypes,
        accountGroups: prev.accountGroups,
        accountGroupByBalanceKey: prev.accountGroupByBalanceKey,
        hiddenAccountBalanceKeys: prev.hiddenAccountBalanceKeys,
        watchedPortfolioAccountKeys: prev.watchedPortfolioAccountKeys,
      };
      void saveState(
        {
          snapshot: null,
          workingPlan: null,
          scenarios: [],
          settings: keptSettings,
          portfolioImports,
          payrollImports: [],
          netPositionImports,
          positionSalaryImports,
        },
        userIdRef.current
      );
      return keptSettings;
    });
    setSnapshot(null);
    setWorkingPlan(null);
    setScenarios([]);
    setPayrollImports([]);
    setPendingPayrollImports([]);
    setPendingPreview(null);
    setPendingSnapshot(null);
    setPendingMergeInfo(null);
    setDataMigrated(false);
  }, [portfolioImports, netPositionImports, positionSalaryImports]);

  const value: AppContextValue = {
    snapshot: snapshotForUi,
    workingPlan,
    allocations,
    settings,
    scenarios,
    loading,
    pendingPreview,
    pendingSnapshot,
    pendingMergeInfo,
    dataMigrated,
    hasData: !!snapshot && snapshot.parseStatus !== "failed",
    parsePayrollFiles,
    parseFile,
    confirmImport,
    cancelImport,
    resetToImported,
    updateAllocation,
    updateSettings,
    updateFundingSourceAlias,
    setFundingSourceCategory,
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
    portfolioTitlesByChartstring,
    portfolioImports,
    payrollImports,
    netPositionImports,
    positionSalaryImports,
    mergedPortfolioBalances,
    hiddenAccountKeys,
    parsePortfolioFile,
    importPortfolioFiles,
    removePortfolioImport,
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
