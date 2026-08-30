import { chartstringFundDeptProject } from "@/lib/funding/chartstring";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import {
  getEmployeePersonnelType,
  getPersonnelGroups,
  getPersonnelTypeMeta,
} from "@/lib/employees/personnelType";
import {
  buildSharedAccountBurnIndex,
  computeEmployeeRunway,
  type RunwayAccountLine,
  type RunwayBalanceSource,
} from "@/lib/runway/calculate";
import { buildFundingMixForEmployees } from "@/lib/dashboard/metrics";
import { employeePersonKey, resolveEmployeeProfile } from "@/lib/employees/stableKey";
import {
  projectionsPersonHref,
  runwayAccountHref,
  settingsAccountsHref,
} from "@/lib/navigation/deepLinks";
import { monthLabelLong, shiftMonth } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import type { AccountBalance } from "@/lib/funding/accountBalances";
import type {
  AppSettings,
  Employee,
  FundingSource,
  PayrollReportSnapshot,
  WorkingPlan,
} from "@/types";

/** A person's funding ending inside this window is critical. */
export const CRITICAL_MONTHS = 3;
/** Between critical and this many months is a watch state. */
export const CAUTION_MONTHS = 6;
/** A group with more than this share of charges uncategorized is a data issue. */
export const UNATTRIBUTED_THRESHOLD = 0.1;
/** Rows shown before the "view all" link. */
export const ATTENTION_ROW_CAP = 5;

export type AttentionSeverity = "critical" | "caution" | "data";

export type AttentionKind = "person" | "account" | "data";

export interface AttentionRow {
  id: string;
  severity: AttentionSeverity;
  /** What the row is about, so a summary can say "2 people and 1 account". */
  kind: AttentionKind;
  /** Chip text — severity is never carried by color alone. */
  severityLabel: string;
  entity: string;
  /** Personnel group or account code. */
  context?: string;
  detail: string;
  href: string;
  actionLabel: string;
  /** Months until this becomes a problem; drives the sort. */
  months: number;
  /** The person most associated with this row, when exactly one is known. */
  personName?: string;
  photoUrl?: string;
}

export interface PersonAtRisk {
  employeeId: string;
  name: string;
  months: number;
}

export interface AccountAtRisk {
  chartRoot: string;
  name: string;
  months: number;
  balance: number;
}

export interface AttentionQueue {
  rows: AttentionRow[];
  totalCount: number;
  /** People whose funding ends inside the scope window. */
  peopleAtRisk: PersonAtRisk[];
  /** Accounts that run out inside the scope window. */
  accountsAtRisk: AccountAtRisk[];
  /** Accounts already in deficit. */
  overdrawnAccounts: AccountAtRisk[];
}

export interface FundedRoot {
  chartRoot: string;
  name: string;
  balance: number;
  /** Combined burn of everyone charging this account, not just one person's share. */
  sharedMonthlyBurn: number;
  /**
   * How the balance was arrived at. `"none"` means no reported balance, manual
   * override, or end-date estimate matched this chartstring — the account is
   * charged but unpriced, which is a data gap, not a zero balance.
   */
  balanceSource: RunwayBalanceSource;
}

export interface RunwayContext {
  monthsByEmployee: Map<string, number | null>;
  /** Shortest remaining fund for each person, when one is known. */
  limitingAccountByEmployee: Map<string, { name: string; chartRoot: string }>;
  /** One line per fund-dept-project, deduped across everyone charging it. */
  accounts: AccountAtRisk[];
  /** Every employee counted against each account — used to tell a solo grant from a shared one. */
  accountContributors: Map<string, Set<string>>;
  /**
   * Every account with current-month payroll on it, deduped by fund-dept-project.
   * Unlike `accounts`, this includes assumed-OK funds (someone else's account) at
   * the estimated balance their end date implies, so "what is actually available
   * to pay these people" counts restricted money the same way Runway shows it.
   */
  fundedRoots: Map<string, FundedRoot>;
  /** Accounts each person draws on, for rolling funded roots up to a team. */
  rootsByEmployee: Map<string, Set<string>>;
}

function chartRoot(line: RunwayAccountLine): string {
  return chartstringFundDeptProject(line.chartstring) || line.chartstring;
}

/**
 * Runs the existing per-person runway calculation once and returns both views
 * the dashboard needs: blended months per employee, and deduped accounts.
 */
export function buildRunwayContext(
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null,
  fundingSources: FundingSource[],
  settings: AppSettings,
  accountBalances: Map<string, AccountBalance>
): RunwayContext {
  const sharedBurnIndex = buildSharedAccountBurnIndex(
    snapshot,
    workingPlan,
    fundingSources,
    settings
  );
  const monthsByEmployee = new Map<string, number | null>();
  const limitingAccountByEmployee = new Map<string, { name: string; chartRoot: string }>();
  const accounts = new Map<string, AccountAtRisk>();
  const accountContributors = new Map<string, Set<string>>();
  const fundedRoots = new Map<string, FundedRoot>();
  const rootsByEmployee = new Map<string, Set<string>>();

  for (const employee of filterEmployeesForPlanning(snapshot.employees, settings)) {
    const summary = computeEmployeeRunway(
      employee,
      snapshot,
      workingPlan,
      fundingSources,
      settings,
      accountBalances,
      sharedBurnIndex,
      { revealHidden: false }
    );

    // Assumed-OK accounts count at their estimated balance, matching
    // computeEmployeeRunway and fundedRoots. Excluding them here is what kept
    // per-person runway, the attention queue and the verdict disagreeing with
    // Available Payroll about the same account.
    const counted = summary.accounts.filter((a) => !a.isHidden);
    monthsByEmployee.set(
      employee.id,
      counted.length > 0 ? summary.blendedMonthsRunway : null
    );

    const employeeRoots = rootsByEmployee.get(employee.id) ?? new Set<string>();
    for (const line of summary.accounts) {
      if (line.isHidden) continue;
      const root = chartRoot(line);
      employeeRoots.add(root);
      if (!fundedRoots.has(root)) {
        fundedRoots.set(root, {
          chartRoot: root,
          name: line.displayName,
          balance: line.balance,
          sharedMonthlyBurn: line.sharedMonthlyBurn,
          balanceSource: line.balanceSource,
        });
      }
    }
    rootsByEmployee.set(employee.id, employeeRoots);

    let limiting: { name: string; chartRoot: string; months: number } | null = null;
    for (const line of counted) {
      if (line.monthsRunway === null) continue;
      const root = chartRoot(line);
      if (!limiting || line.monthsRunway < limiting.months) {
        limiting = { name: line.displayName, chartRoot: root, months: line.monthsRunway };
      }
      if (!accounts.has(root)) {
        accounts.set(root, {
          chartRoot: root,
          name: line.displayName,
          months: line.monthsRunway,
          balance: line.balance,
        });
      }
      const contributors = accountContributors.get(root) ?? new Set<string>();
      contributors.add(employee.id);
      accountContributors.set(root, contributors);
    }
    if (limiting) {
      limitingAccountByEmployee.set(employee.id, {
        name: limiting.name,
        chartRoot: limiting.chartRoot,
      });
    }
  }

  return {
    monthsByEmployee,
    limitingAccountByEmployee,
    accounts: [...accounts.values()],
    accountContributors,
    fundedRoots,
    rootsByEmployee,
  };
}

/**
 * Total balance and combined burn across every account with current payroll,
 * already deduped by fund-dept-project. Same shape as computeEmployeeRunway's
 * own blendedMonthsRunway (totalBalance / totalMonthlyBurn over deduped roots),
 * widened from one person to a set of accounts — not a new derivation.
 */
export function totalFundedRoots(roots: Iterable<FundedRoot>): {
  balance: number;
  monthlyBurn: number;
  months: number | null;
  /** Accounts whose balance is known — the ones the total is actually built from. */
  pricedCount: number;
  /** Accounts charged but with no balance on file. They drag the runway down at $0. */
  unpricedCount: number;
  /** Monthly burn sitting on those unpriced accounts. */
  unpricedMonthlyBurn: number;
  hasEstimated: boolean;
} {
  let balance = 0;
  let monthlyBurn = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let unpricedMonthlyBurn = 0;
  let hasEstimated = false;
  for (const root of roots) {
    balance += root.balance;
    monthlyBurn += root.sharedMonthlyBurn;
    if (root.balanceSource === "none") {
      unpricedCount += 1;
      unpricedMonthlyBurn += root.sharedMonthlyBurn;
    } else {
      pricedCount += 1;
      if (root.balanceSource === "estimated") hasEstimated = true;
    }
  }
  return {
    balance,
    monthlyBurn,
    months: monthlyBurn > 0 ? balance / monthlyBurn : null,
    pricedCount,
    unpricedCount,
    unpricedMonthlyBurn,
    hasEstimated,
  };
}

function severityFor(months: number): AttentionSeverity | null {
  if (months < CRITICAL_MONTHS) return "critical";
  if (months < CAUTION_MONTHS) return "caution";
  return null;
}

function severityLabel(severity: AttentionSeverity): string {
  if (severity === "critical") return "Critical";
  if (severity === "caution") return "Caution";
  return "Data";
}

function groupNameFor(settings: AppSettings, employeeId: string): string | undefined {
  const type = getEmployeePersonnelType(settings, employeeId);
  if (!type) return undefined;
  const meta = getPersonnelTypeMeta(type, settings);
  return meta.shortLabel ?? meta.label;
}

/** `already short`, or `September 2026`. */
export function fundedThroughMonthLabel(planningMonth: string, months: number): string {
  if (months < 0) return "already short";
  return monthLabelLong(shiftMonth(planningMonth, Math.floor(months)));
}

export function fundedThroughLabel(planningMonth: string, months: number): string {
  if (months < 0) return "already short";
  return `funded through ${fundedThroughMonthLabel(planningMonth, months)}`;
}

/**
 * When the limiting account's own balance is negative, name the actual
 * deficit rather than the vaguer "already short" — the same figure the
 * account's own row would have shown, had it not been folded in here.
 */
export function personDetail(
  planningMonth: string,
  months: number,
  limitingAccount: string | undefined,
  limitingAccountBalance?: number
): string {
  if (months < 0 && limitingAccountBalance !== undefined && limitingAccountBalance < 0) {
    const deficit = `overdrawn ${formatCurrency(Math.abs(limitingAccountBalance))}`;
    return limitingAccount ? `${deficit} · ${limitingAccount}` : deficit;
  }
  const through = fundedThroughLabel(planningMonth, months);
  return limitingAccount ? `${through} · ${limitingAccount}` : through;
}

function uncategorizedRows(
  employees: Employee[],
  snapshot: PayrollReportSnapshot,
  fundingSources: FundingSource[],
  settings: AppSettings,
  planningMonth: string
): AttentionRow[] {
  const rows: AttentionRow[] = [];

  for (const group of getPersonnelGroups(settings)) {
    const members = employees.filter(
      (e) => getEmployeePersonnelType(settings, e.id) === group.id
    );
    if (members.length === 0) continue;

    const slices = buildFundingMixForEmployees(
      members,
      [planningMonth],
      snapshot,
      fundingSources,
      settings
    );
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (total <= 0) continue;

    const uncategorized = slices.find((s) => s.key === "uncategorized")?.value ?? 0;
    const share = uncategorized / total;
    if (share <= UNATTRIBUTED_THRESHOLD) continue;

    const meta = getPersonnelTypeMeta(group.id, settings);
    rows.push({
      id: `uncategorized-${group.id}`,
      kind: "data",
      severity: "data",
      severityLabel: severityLabel("data"),
      entity: meta.shortLabel ?? meta.label,
      detail: `${Math.round(share * 100)}% of charges have no funding type`,
      href: settingsAccountsHref(group.id),
      actionLabel: "Categorize",
      // Data issues sort after dated risks but stay in the same queue.
      months: CAUTION_MONTHS,
    });
  }

  return rows;
}

export function buildAttentionQueue({
  snapshot,
  fundingSources,
  settings,
  planningMonth,
  horizonMonths,
  runway,
}: {
  snapshot: PayrollReportSnapshot;
  fundingSources: FundingSource[];
  settings: AppSettings;
  planningMonth: string;
  horizonMonths: number;
  runway: RunwayContext;
}): AttentionQueue {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const accountsByRoot = new Map(runway.accounts.map((a) => [a.chartRoot, a]));

  // Accounts first: whether a person's row is redundant with their account's
  // depends on whether that account is actually overdrawn, so that has to be
  // known before deciding which of the two rows to keep.
  const accountsAtRisk: AccountAtRisk[] = [];
  const overdrawnAccounts: AccountAtRisk[] = [];
  const qualifyingAccounts = new Map<string, { severity: AttentionSeverity; overdrawn: boolean }>();

  for (const account of runway.accounts) {
    const overdrawn = account.balance < 0;
    if (overdrawn) overdrawnAccounts.push(account);
    if (account.months < horizonMonths) accountsAtRisk.push(account);

    const severity = overdrawn ? "critical" : severityFor(account.months);
    if (!severity) continue;
    qualifyingAccounts.set(account.chartRoot, { severity, overdrawn });
  }

  const peopleAtRisk: PersonAtRisk[] = [];
  const personRows: AttentionRow[] = [];
  const peopleWithRows = new Set<string>();

  for (const [employeeId, months] of runway.monthsByEmployee) {
    if (months === null) continue;
    const employee = byId.get(employeeId);
    if (!employee) continue;

    if (months < horizonMonths) {
      peopleAtRisk.push({ employeeId, name: employee.name, months });
    }

    const severity = severityFor(months);
    if (!severity) continue;

    const limiting = runway.limitingAccountByEmployee.get(employeeId);
    const contributors = limiting ? runway.accountContributors.get(limiting.chartRoot) : undefined;
    const soleContributor = contributors?.size === 1;
    const accountState = limiting ? qualifyingAccounts.get(limiting.chartRoot) : undefined;

    // The account itself is out of money — that's a fund problem, not a
    // personnel one. Its own row already says so; don't also frame it as
    // this person individually being overdrawn.
    if (soleContributor && accountState?.overdrawn) continue;

    peopleWithRows.add(employeeId);
    personRows.push({
      id: `person-${employeeId}`,
      kind: "person",
      severity,
      severityLabel: severityLabel(severity),
      entity: employee.name,
      context: groupNameFor(settings, employeeId),
      detail: personDetail(
        planningMonth,
        months,
        limiting?.name,
        limiting ? accountsByRoot.get(limiting.chartRoot)?.balance : undefined
      ),
      // Reassigning effort is a Projections rule — Runway has no such control,
      // so pointing there named an action the destination didn't offer.
      href: projectionsPersonHref(employeePersonKey(employee)),
      actionLabel: "Reassign",
      months,
      personName: employee.name,
      photoUrl: resolveEmployeeProfile(settings, employee)?.photoUrl,
    });
  }

  const accountRows: AttentionRow[] = [];

  for (const account of runway.accounts) {
    const qualifies = qualifyingAccounts.get(account.chartRoot);
    if (!qualifies) continue;
    const { severity, overdrawn } = qualifies;

    const contributors = runway.accountContributors.get(account.chartRoot);
    const soleContributor = contributors?.size === 1 ? [...contributors][0] : undefined;

    if (!overdrawn && soleContributor && peopleWithRows.has(soleContributor)) {
      // Account still has money; the limiting factor is this person's own
      // burn against it, and their row (funded through {date} · account)
      // already says that — don't restate it as a second, account-shaped row.
      continue;
    }

    const soleContributorEmployee = soleContributor ? byId.get(soleContributor) : undefined;
    const soleContributorName = soleContributorEmployee?.name;

    accountRows.push({
      id: `account-${account.chartRoot}`,
      kind: "account",
      severity,
      severityLabel: severityLabel(severity),
      entity: account.name,
      context: account.chartRoot,
      detail: overdrawn
        ? `overdrawn ${formatCurrency(Math.abs(account.balance))}${
            soleContributorName ? ` · ${soleContributorName}` : ""
          }`
        : fundedThroughLabel(planningMonth, account.months),
      href: runwayAccountHref(account.chartRoot),
      actionLabel: "Review",
      months: overdrawn ? -1 : account.months,
      personName: soleContributorName,
      photoUrl: soleContributorEmployee
        ? resolveEmployeeProfile(settings, soleContributorEmployee)?.photoUrl
        : undefined,
    });
  }

  const dataRows = uncategorizedRows(
    employees,
    snapshot,
    fundingSources,
    settings,
    planningMonth
  );

  const severityRank: Record<AttentionSeverity, number> = {
    critical: 0,
    caution: 1,
    data: 2,
  };

  const rows = [...personRows, ...accountRows, ...dataRows].sort((a, b) => {
    const bySeverity = severityRank[a.severity] - severityRank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.months !== b.months) return a.months - b.months;
    return a.entity.localeCompare(b.entity);
  });

  return {
    rows: rows.slice(0, ATTENTION_ROW_CAP),
    totalCount: rows.length,
    peopleAtRisk: peopleAtRisk.sort((a, b) => a.months - b.months),
    accountsAtRisk: accountsAtRisk.sort((a, b) => a.months - b.months),
    overdrawnAccounts: overdrawnAccounts.sort((a, b) => a.balance - b.balance),
  };
}
