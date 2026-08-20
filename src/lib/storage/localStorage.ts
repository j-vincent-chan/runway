import type {
  AppSettings,
  PayrollReportImport,
  PayrollReportSnapshot,
  PortfolioReportImport,
  Scenario,
  WorkingPlan,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { ensureCatalogDefaults } from "@/lib/supabase/catalog";

const KEY = "payroll-funding-planner";

export interface StoredAppState {
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  scenarios: Scenario[];
  settings: AppSettings;
  portfolioImports: PortfolioReportImport[];
  payrollImports?: PayrollReportImport[];
  /** ISO timestamp of last local save — used to reconcile with Supabase */
  savedAt?: string;
}

function emptyState(): StoredAppState {
  return {
    snapshot: null,
    workingPlan: null,
    scenarios: [],
    settings: ensureCatalogDefaults(DEFAULT_SETTINGS),
    portfolioImports: [],
    payrollImports: [],
  };
}

export function loadState(): StoredAppState {
  if (typeof window === "undefined") {
    return emptyState();
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as StoredAppState;
    return {
      snapshot: parsed.snapshot ?? null,
      workingPlan: parsed.workingPlan ?? null,
      scenarios: parsed.scenarios ?? [],
      settings: ensureCatalogDefaults({ ...DEFAULT_SETTINGS, ...parsed.settings }),
      portfolioImports: parsed.portfolioImports ?? [],
      payrollImports: parsed.payrollImports ?? [],
      savedAt: parsed.savedAt,
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: StoredAppState): void {
  if (typeof window === "undefined") return;
  const savedAt = state.savedAt ?? new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt }));
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
