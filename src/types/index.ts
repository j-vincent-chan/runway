export type ParseStatus = "success" | "partial" | "failed";
export type WarningSeverity = "info" | "warning" | "error";
export type SourceType = "actual" | "future" | "unknown";
export type AllocationStatus = "imported" | "edited" | "scenario";
export type RowType = "baseSalary" | "percentEffort" | "benefits" | "totalCompBenefits" | "other";
export type CoverageStatus =
  | "fullyCovered"
  | "underallocated"
  | "overallocated"
  | "noFutureDistribution"
  | "unknown";
export type CliffSeverity = "watch" | "atRisk" | "urgent";
export type PayFrequency = "biweekly" | "monthly" | "semimonthly" | "weekly";

/**
 * Personnel group id (built-in or user-defined).
 * Legacy built-ins: researchDevelopment | projectManagementClinical | dataManagement | communityManagement
 */
export type PersonnelType = string;

/**
 * Funding source type id (built-in or user-defined).
 * Legacy built-ins: startup | projects | endowment | institutional | largeGrants | researchPlanReviews
 */
export type AccountCategory = string;

/** User-editable personnel group definition (Settings + Supabase). */
export interface PersonnelGroupDef {
  id: string;
  label: string;
  shortLabel?: string;
  pillClass: string;
  dotClass: string;
  chartColor: string;
  sortOrder: number;
}

/** User-editable funding source type definition (Settings + Supabase). */
export interface FundingSourceTypeDef {
  id: string;
  label: string;
  pillClass: string;
  dotClass: string;
  chartColor: string;
  sortOrder: number;
}

/** User-editable account group for Account Balances (Settings + Supabase). */
export interface AccountGroupDef {
  id: string;
  label: string;
  pillClass: string;
  dotClass: string;
  chartColor: string;
  sortOrder: number;
}

/** Sort options for the Account Balances list */
export type AccountBalanceSortKey =
  | "titleAsc"
  | "balanceAsc"
  | "balanceDesc"
  | "withdrawalsDesc"
  | "withdrawalsAsc";

/** How employees are ordered on Timeline / Projections / Runway */
export type EmployeeGroupSort = "lastName" | "personnelGroup";
export interface ParseWarning {
  id: string;
  severity: WarningSeverity;
  sheetName?: string;
  rowNumber?: number;
  columnName?: string;
  message: string;
  rawValue?: string;
}

export interface Employee {
  id: string;
  name: string;
  appointmentPercent: number;
  role?: string;
  employeeId?: string;
  annualSalary?: number;
  annualBenefits?: number;
  annualSalaryBenefits?: number;
  /** From payroll "Compensation Type" on the employee row (e.g. Biweekly, Monthly). */
  compensationType?: string;
  payFrequency?: PayFrequency;
  notes?: string;
}

export interface FundingSource {
  id: string;
  rawName: string;
  alias: string;
  accountString?: string;
  projectId?: string;
  fund?: string;
  color: string;
  notes?: string;
}

export interface MonthlyAllocation {
  id: string;
  employeeId: string;
  fundingSourceId: string;
  month: string;
  percentEffort: number;
  sourceType: SourceType;
  status: AllocationStatus;
  rawValue?: string;
  notes?: string;
}

export interface MonthlyCostRecord {
  id: string;
  employeeId: string;
  fundingSourceId?: string;
  month: string;
  rowType: RowType;
  amount: number;
  sourceType: SourceType;
  rawValue?: string;
}

export interface RawParsedRow {
  sheetName: string;
  rowNumber: number;
  employeeId?: string;
  fundingSourceId?: string;
  detectedRowType?: RowType;
  label: string;
  values: unknown[];
}

export interface PayrollReportSnapshot {
  id: string;
  sourceFileName: string;
  uploadedAt: string;
  reportName: string;
  reportDate?: string;
  sheetName: string;
  parserVersion: string;
  parseStatus: ParseStatus;
  parseWarnings: ParseWarning[];
  employees: Employee[];
  fundingSources: FundingSource[];
  monthlyAllocations: MonthlyAllocation[];
  monthlyCosts: MonthlyCostRecord[];
  rawRows: RawParsedRow[];
  monthRange: { start: string; end: string };
  actualMonths: string[];
  futureMonths: string[];
}

export interface CoverageSummary {
  employeeId: string;
  month: string;
  expectedPercent: number;
  allocatedPercent: number;
  unallocatedPercent: number;
  overallocatedPercent: number;
  status: CoverageStatus;
}

export interface FundingCliff {
  id: string;
  employeeId: string;
  employeeName: string;
  fromMonth: string;
  toMonth: string;
  beforePercent: number;
  afterPercent: number;
  dropPercent: number;
  severity: CliffSeverity;
  explanation: string;
}

export interface ScenarioChange {
  employeeId: string;
  fundingSourceId: string;
  month: string;
  percentEffort: number;
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  baseSnapshotId: string;
  changes: ScenarioChange[];
  impactSummary?: string[];
}

export interface PortfolioBalanceRow {
  chartstring: string;
  balance: number;
  projectTitle?: string;
  fund: string;
  dept: string;
  project: string;
  activity?: string;
}

export interface PortfolioReportImport {
  id: string;
  sourceFileName: string;
  uploadedAt: string;
  /** From Parameters → Report Run Date (used for duplicate chartstrings) */
  reportRunDate: string;
  sheetName: string;
  rows: PortfolioBalanceRow[];
}

/** One account row from a Net Position Report (PI-tracked accounts over time). */
export interface NetPositionAccountRow {
  /** fund-dept-project (codes only) */
  accountKey: string;
  busUnit: string;
  fund: string;
  fundDescription?: string;
  dept: string;
  deptDescription?: string;
  project: string;
  projectDescription?: string;
  parentAwardId?: string;
  parentAwardDescription?: string;
  beginningBalance: number;
  revenues: number;
  expenses: number;
  otherChanges: number;
  netChange: number;
  endingBalance: number;
}

export interface NetPositionReportImport {
  id: string;
  sourceFileName: string;
  uploadedAt: string;
  /** From Parameters → Report Run Date */
  reportRunDate: string;
  /** Period start (yyyy-MM) from Date Parameters when present */
  periodStart?: string;
  /** Period end (yyyy-MM) from Date Parameters — primary time axis for trends */
  periodEnd?: string;
  sheetName: string;
  rows: NetPositionAccountRow[];
}

/** One row from Employee and Position Salary Report (a job/appointment). */
export interface PositionSalaryPosition {
  position: string;
  jobCode?: string;
  jobFte: number;
  employeeStatus?: string;
  employeeClass?: string;
  salaryAdminPlan?: string;
  compFreq?: string;
  jobEffectiveDate?: string;
  distributionBeginDate?: string;
  baseSalaryX: number;
  negotiatedSalaryY: number;
  otherCompensationZ: number;
  totalSalary: number;
}

/** One person on an Employee and Position Salary Report (totals across positions). */
export interface PositionSalaryPerson {
  name: string;
  ucsfEmplId: string;
  ucpathEmplId?: string;
  reportsTo?: string;
  jobFte: number;
  compFreq?: string;
  role?: string;
  baseSalaryX: number;
  negotiatedSalaryY: number;
  otherCompensationZ: number;
  totalSalary: number;
  positions: PositionSalaryPosition[];
}

/** Official FY salary rates from Employee and Position Salary Report. */
export interface PositionSalaryReportImport {
  id: string;
  sourceFileName: string;
  uploadedAt: string;
  reportRunDate?: string;
  /** e.g. "2026-27" */
  fiscalYear?: string;
  sheetName: string;
  people: PositionSalaryPerson[];
}

/** One uploaded Payroll Funding Report (merged like MyPortfolio files). */
export interface PayrollReportImport {
  id: string;
  sourceFileName: string;
  uploadedAt: string;
  monthRange: { start: string; end: string };
  employeeCount: number;
  fundingSourceCount: number;
  parseStatus: ParseStatus;
  /** Full parse contribution so removals can re-fold remaining files */
  snapshot: PayrollReportSnapshot;
}
export interface EmployeeOfferLetterMeta {
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  /** yyyy-MM-dd detected when the file was uploaded */
  extractedStartDate?: string;
  extractedEndDate?: string;
  /** Annual starting salary detected from the offer letter (USD) */
  extractedStartingSalary?: number;
  /** Stable storage ref (sb://…) or signed/external URL when the file is in Supabase */
  fileUrl?: string;
  /** Storage object path for deletes and signed URL refresh */
  storagePath?: string;
}
export interface EmployeeProfile {
  /** Optional image URL (circle-cropped in UI) */
  photoUrl?: string;
  /** Employment start (yyyy-MM-dd), manual or from offer letter */
  startDate?: string;
  /** Employment end for alumni (yyyy-MM-dd) */
  endDate?: string;
  offerLetter?: EmployeeOfferLetterMeta;
}

/** User-defined org column on the Structure page */
export interface OrgBranch {
  id: string;
  name: string;
  employeeIds: string[];
}

export interface OrgStructure {
  /** Chart title (e.g. "Our Team") */
  title?: string;
  subtitle?: string;
  /** Person shown in the top director node */
  leadEmployeeId?: string;
  branches: OrgBranch[];
}

export type RemainderAction =
  | { kind: "uncovered" }
  | { kind: "moveTo"; chartstringKey: string; percentEffort?: number }
  | { kind: "endEmployment" };

export type ProjectionTrigger =
  | { type: "onDate"; month: string }
  | { type: "dollarCap"; amount: number; fromMonth: string }
  | { type: "fundsDepleted" }
  | { type: "setEffort"; fromMonth: string; percentEffort: number };

export interface ProjectionRule {
  id: string;
  /** `hr:` / `name:` key — survives payroll re-import */
  personKey: string;
  /** Normalized chartstring or planned key; omit for employee-wide employment end */
  chartstringKey?: string;
  trigger: ProjectionTrigger;
  remainder: RemainderAction;
  /** Apply this rule from origin even when imported payroll still shows a different mix */
  applyOverPayroll?: boolean;
}

export interface PlannedFundingSource {
  id: string;
  /** Normalized chartstring, or `planned:{id}` when the user has no chartstring yet */
  chartstringKey: string;
  accountString?: string;
  alias: string;
  color: string;
  openingBalance?: number;
  /** Last month this planned project is on (yyyy-MM) */
  projectEndMonth?: string;
  notes?: string;
}

export type ProjectionHorizonPreset = "fy" | "6" | "12" | "24" | "custom";

export interface ProjectionHorizonSettings {
  preset: ProjectionHorizonPreset;
  customEndMonth?: string;
}

export interface AppSettings {
  fiscalYearStartMonth: number;
  supportEndingSoonDays: number;
  fundingCliffThreshold: number;
  defaultView: "monthly" | "quarterly" | "fiscalYear";
  displayMode: "percent" | "dollars" | "both";
  fundingSourceAliases: Record<string, { alias: string; color?: string; notes?: string }>;
  /** Stable chartstring keys → funding source type on Accounts */
  fundingSourceCategories?: Record<string, AccountCategory>;
  /** Catalog of funding source types (Settings CRUD; synced to Supabase) */
  fundingSourceTypes?: FundingSourceTypeDef[];
  /** Catalog of personnel groups (Settings CRUD; synced to Supabase) */
  personnelGroups?: PersonnelGroupDef[];
  /** Catalog of account groups for Account Balances (Settings CRUD; synced to Supabase) */
  accountGroups?: AccountGroupDef[];
  /**
   * Account Balances / Net Position Report Accounts: fund-dept-project → account group id.
   * Normalized lowercase keys (same space as hiddenAccountBalanceKeys).
   */
  accountGroupByBalanceKey?: Record<string, string>;
  /** Account Balances list sort preference */
  accountBalanceSort?: AccountBalanceSortKey;
  /**
   * Multi-select account group ids for Account Balances.
   * Empty or unset = show all. Use `"unassigned"` for accounts without a group.
   */
  accountGroupFilter?: string[];
  /** Keys: `${employeeId}|${fundingSourceId}` — hide the fund row on timeline/runway only */
  hiddenEmployeeFunds?: string[];
  /** Keys: `${employeeId}|${fundingSourceId}` — not your account; skip runway for this fund */
  runwayAssumedOkFunds?: string[];
  /** Keys: `${employeeId}|${fundingSourceId}` — ISO date (yyyy-MM-dd) when external funding ends */
  runwayAssumedEndDates?: Record<string, string>;
  /** Per-employee photo and other roster metadata */
  employeeProfiles?: Record<string, EmployeeProfile>;
  /** Hidden from timeline, runway, and default employees list */
  hiddenEmployeeIds?: string[];
  /** Moved to alumni roster — excluded from active planning views */
  alumniEmployeeIds?: string[];
  /** Per-employee planning target % when you only manage part of their appointment */
  employeePlanningScope?: Record<string, number>;
  /** Roster personnel group assignment (employee id → group id) */
  employeePersonnelTypes?: Record<string, PersonnelType>;
  /** @deprecated Prefer personnelGroupFilter — kept for older saved settings */
  employeeGroupSort?: EmployeeGroupSort;
  /**
   * Multi-select personnel group ids for Timeline / Projections / Runway.
   * Empty or unset = show all. Use `"unassigned"` for people without a group.
   */
  personnelGroupFilter?: string[];
  /** Timeline month window (yyyy-MM); defaults to past 12 months when unset */
  timelineViewRange?: { start: string; end: string };
  /** Keys: `${employeeId}|${normalizedChartstring}` — manual balance override */
  runwayBalanceOverrides?: Record<string, number>;
  /** Keys: `${employeeId}|${fundingSourceId}` — linked % effort and monthly burn */
  runwayBurnOverrides?: Record<string, { percentEffort: number; monthlyBurn: number }>;
  /** Custom team layout — branch names and member assignments */
  orgStructure?: OrgStructure;
  projectionHorizon?: ProjectionHorizonSettings;
  plannedFundingSources?: PlannedFundingSource[];
  projectionRules?: ProjectionRule[];
  /** personKeys whose roster endDate should not zero projections */
  projectionIgnoreRosterEndDates?: string[];
  /** Hide the left navigation to give tables more width */
  sidebarHidden?: boolean;
  /** Hide the timeline insights column (gaps, coverage, cliffs) */
  analyticsPanelHidden?: boolean;
  /** Keep year/month headers visible while scrolling Timeline and Projections grids */
  freezeGridHeader?: boolean;
  /**
   * Account Balances page: fund-dept-project keys to hide from the main list.
   * Normalized lowercase (e.g. `7000-129074-7030722`).
   */
  hiddenAccountBalanceKeys?: string[];
  /**
   * Accounts the user has explicitly revealed even though every person
   * charging them has the fund hidden on Runway/Timeline. Without this an
   * account hidden everywhere on Runway could never be shown again from
   * Settings, since the hide is derived rather than stored.
   */
  unhiddenAccountBalanceKeys?: string[];
  /**
   * Account Balances page: MyPortfolio accounts opted in for watching
   * (fund-dept-project keys). Net Position accounts appear by default.
   */
  watchedPortfolioAccountKeys?: string[];
}
export interface WorkingPlan {
  snapshotId: string;
  allocations: MonthlyAllocation[];
  updatedAt: string;
}

export interface ParsePreview {
  sheetNames: string[];
  selectedSheet: string;
  employees: number;
  fundingSources: number;
  allocations: number;
  costs: number;
  monthRange: { start: string; end: string };
  parseStatus: ParseStatus;
  warnings: ParseWarning[];
  sampleRows: RawParsedRow[];
  diagnostics: string[];
}

export const PARSER_VERSION = "1.5.0";
export const DEFAULT_SETTINGS: AppSettings = {
  fiscalYearStartMonth: 7,
  supportEndingSoonDays: 90,
  fundingCliffThreshold: 25,
  defaultView: "monthly",
  displayMode: "percent",
  fundingSourceAliases: {},
  fundingSourceCategories: {},
  fundingSourceTypes: [],
  personnelGroups: [],
  accountGroups: [],
  accountGroupByBalanceKey: {},
  accountBalanceSort: "balanceDesc",
  accountGroupFilter: [],
  hiddenEmployeeFunds: [],
  runwayAssumedOkFunds: [],
  runwayAssumedEndDates: {},
  employeeProfiles: {},
  hiddenEmployeeIds: [],
  alumniEmployeeIds: [],
  employeePlanningScope: {},
  employeePersonnelTypes: {},
  employeeGroupSort: "lastName",
  personnelGroupFilter: [],
  projectionHorizon: { preset: "12" },
  plannedFundingSources: [],
  projectionRules: [],
  projectionIgnoreRosterEndDates: [],
  sidebarHidden: false,
  analyticsPanelHidden: false,
  freezeGridHeader: true,
  hiddenAccountBalanceKeys: [],
  unhiddenAccountBalanceKeys: [],
  watchedPortfolioAccountKeys: [],
};

/** Soft bar fills — pair with dark text in timeline cells */
export const FUNDING_COLORS = [
  "#c8daf0",
  "#d4e2f4",
  "#c5e6d5",
  "#e2d8f0",
  "#f5ddd0",
  "#c9e9ee",
  "#e4eaf2",
  "#fdecc8",
  "#dce4fc",
  "#d4f1f9",
  "#ede4f7",
  "#f8e0ec",
];
