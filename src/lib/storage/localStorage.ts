import type {
  AppSettings,
  PayrollReportSnapshot,
  PortfolioReportImport,
  Scenario,
  WorkingPlan,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

const KEY = "payroll-funding-planner";

export interface StoredAppState {
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  scenarios: Scenario[];
  settings: AppSettings;
  portfolioImports: PortfolioReportImport[];
  /** ISO timestamp of last local save — used to reconcile with Supabase */
  savedAt?: string;
}

export function loadState(): StoredAppState {
  if (typeof window === "undefined") {
    return {
      snapshot: null,
      workingPlan: null,
      scenarios: [],
      settings: DEFAULT_SETTINGS,
      portfolioImports: [],
    };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw)
      return {
        snapshot: null,
        workingPlan: null,
        scenarios: [],
        settings: DEFAULT_SETTINGS,
        portfolioImports: [],
      };
    const parsed = JSON.parse(raw) as StoredAppState;
    return {
      snapshot: parsed.snapshot ?? null,
      workingPlan: parsed.workingPlan ?? null,
      scenarios: parsed.scenarios ?? [],
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      portfolioImports: parsed.portfolioImports ?? [],
      savedAt: parsed.savedAt,
    };
  } catch {
    return {
      snapshot: null,
      workingPlan: null,
      scenarios: [],
      settings: DEFAULT_SETTINGS,
      portfolioImports: [],
    };
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
