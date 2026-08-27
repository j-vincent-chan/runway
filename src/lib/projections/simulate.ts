import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  PayrollReportSnapshot,
  ProjectionRule,
  RemainderAction,
  WorkingPlan,
} from "@/types";
import {
  calculateEmployeeCoverage,
  calculateMonthlyCost,
  getAllMonths,
  getAllocations,
} from "@/lib/calculations";
import {
  chartstringFundDeptProject,
  findBalanceForChartstring,
  normalizeChartstring,
} from "@/lib/funding/chartstring";
import {
  coverageOptionsFromSettings,
  getEffectiveExpectedPercent,
} from "@/lib/funding/visibility";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { buildSharedAccountBurnIndex } from "@/lib/runway/calculate";
import {
  effectiveAssumedEndDate,
  estimateBalanceFromAssumedEnd,
  monthsUntilAssumedEnd,
} from "@/lib/runway/assumedEndDate";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import {
  getEmployeeEndDate,
  getEmployeeStartDate,
} from "@/lib/employees/profile";
import { calculateEmployeeAccountMonthlyBurn } from "@/lib/runway/calculate";
import type { AccountBalance } from "@/lib/funding/accountBalances";
import { hasPercentEffort } from "@/lib/utils/parse";
import {
  getProjectionOriginMonth,
  lastPayrollMonth,
  resolveHorizonMonths,
} from "@/lib/projections/horizon";
import {
  chartstringKeyForFundingSource,
  lookupFundingSource,
  projectionFundingSources,
  unmatchedPlannedSources,
} from "@/lib/projections/sources";

export type Mix = Map<string, Map<string, number>>;

export interface ProjectionAllocation {
  employeeId: string;
  personKey: string;
  chartstringKey: string;
  fundingSourceId: string;
  percentEffort: number;
  monthlyBurn: number;
}

export interface ProjectionMonthState {
  month: string;
  allocations: ProjectionAllocation[];
  remainingByRoot: Record<string, number>;
  coverageByEmployee: Record<
    string,
    {
      expectedPercent: number;
      allocatedPercent: number;
      unallocatedPercent: number;
      overallocatedPercent: number;
      status: string;
    }
  >;
  firedRuleIds: string[];
}

export interface ProjectionConflict {
  personKey: string;
  employeeId: string;
  employeeName: string;
  chartstringKey?: string;
  ruleId?: string;
  message: string;
}

export interface ProjectionStaleness {
  originMonth: string;
  lastPayrollMonth: string | null;
  payrollStale: boolean;
  balanceAsOf?: string;
  balancesStale: boolean;
}

export interface ProjectionResult {
  originMonth: string;
  months: string[];
  states: ProjectionMonthState[];
  conflicts: ProjectionConflict[];
  staleness: ProjectionStaleness;
  sources: FundingSource[];
}

interface PendingOff {
  employeeId: string;
  chartstringKey: string;
  remainder: RemainderAction;
  ruleId: string;
}

function setEffort(mix: Mix, employeeId: string, chartstringKey: string, pct: number) {
  let funds = mix.get(employeeId);
  if (!funds) {
    funds = new Map();
    mix.set(employeeId, funds);
  }
  if (Math.abs(pct) < 0.0001) funds.delete(chartstringKey);
  else funds.set(chartstringKey, pct);
}

function getEffort(mix: Mix, employeeId: string, chartstringKey: string): number {
  return mix.get(employeeId)?.get(chartstringKey) ?? 0;
}

function zeroEmployee(mix: Mix, employeeId: string) {
  mix.set(employeeId, new Map());
}

function chartRoot(chartstringKey: string): string {
  return chartstringFundDeptProject(chartstringKey) ?? normalizeChartstring(chartstringKey);
}

function lastMonthOnOrBefore(months: string[], target: string): string | null {
  const sorted = [...months].sort();
  let last: string | null = null;
  for (const m of sorted) {
    if (m <= target) last = m;
  }
  return last ?? (sorted.length > 0 ? sorted[sorted.length - 1]! : null);
}

function applyRemainder(
  mix: Mix,
  employeeId: string,
  fromKey: string,
  leftover: number,
  remainder: RemainderAction
) {
  if (remainder.kind === "endEmployment") {
    zeroEmployee(mix, employeeId);
    return;
  }
  setEffort(mix, employeeId, fromKey, 0);
  if (remainder.kind === "moveTo" && leftover > 0) {
    const destPct = remainder.percentEffort ?? leftover;
    setEffort(mix, employeeId, remainder.chartstringKey, getEffort(mix, employeeId, remainder.chartstringKey) + destPct);
  }
}

function employmentEndMonth(
  emp: Employee,
  settings: AppSettings,
  personKey: string,
  rules: ProjectionRule[]
): string | undefined {
  const explicit = rules.find(
    (r) => r.personKey === personKey && !r.chartstringKey && r.trigger.type === "onDate"
  );
  if (explicit && explicit.trigger.type === "onDate") return explicit.trigger.month;
  if ((settings.projectionIgnoreRosterEndDates ?? []).includes(personKey)) return undefined;
  const end = getEmployeeEndDate(settings, emp.id, emp);
  return end ? end.slice(0, 7) : undefined;
}

function applyStructuralRules(
  mix: Mix,
  month: string,
  emp: Employee,
  personKey: string,
  settings: AppSettings,
  rules: ProjectionRule[],
  plannedEnds: Map<string, string>,
  fired: string[]
) {
  const start = getEmployeeStartDate(settings, emp.id, emp);
  if (start && month < start.slice(0, 7)) {
    zeroEmployee(mix, emp.id);
    return;
  }
  const endMo = employmentEndMonth(emp, settings, personKey, rules);
  if (endMo && month > endMo) {
    const explicit = rules.find((r) => r.personKey === personKey && !r.chartstringKey);
    if (explicit && !fired.includes(explicit.id)) fired.push(explicit.id);
    zeroEmployee(mix, emp.id);
    return;
  }

  const personRules = rules.filter((r) => r.personKey === personKey && r.chartstringKey);
  for (const rule of personRules) {
    const key = rule.chartstringKey!;
    if (rule.trigger.type === "onDate" && month > rule.trigger.month) {
      const leftover = getEffort(mix, emp.id, key);
      if (leftover > 0 || rule.remainder.kind === "endEmployment") {
        applyRemainder(mix, emp.id, key, leftover, rule.remainder);
        if (!fired.includes(rule.id)) fired.push(rule.id);
      }
    }
    if (rule.trigger.type === "setEffort" && month >= rule.trigger.fromMonth) {
      const current = getEffort(mix, emp.id, key);
      if (Math.abs(current - rule.trigger.percentEffort) > 0.05) {
        if (rule.trigger.percentEffort <= 0) {
          applyRemainder(mix, emp.id, key, current, rule.remainder);
        } else {
          setEffort(mix, emp.id, key, rule.trigger.percentEffort);
        }
        if (!fired.includes(rule.id)) fired.push(rule.id);
      }
    }
  }

  const funds = mix.get(emp.id);
  if (!funds) return;
  for (const [key, pct] of [...funds.entries()]) {
    const projectEnd = plannedEnds.get(key);
    if (projectEnd && month > projectEnd && pct > 0) setEffort(mix, emp.id, key, 0);
  }
}

function cloneMix(mix: Mix): Mix {
  const next: Mix = new Map();
  for (const [employeeId, funds] of mix) {
    next.set(employeeId, new Map(funds));
  }
  return next;
}

/** One-month payroll reversals should not carry into projected months. */
function dropReversalEffort(mix: Mix): void {
  for (const funds of mix.values()) {
    for (const [key, pct] of [...funds.entries()]) {
      if (pct < 0) funds.delete(key);
    }
  }
}

function mixFromAllocations(
  month: string,
  employees: Employee[],
  allocations: MonthlyAllocation[],
  idToKey: Map<string, string>
): Mix {
  const mix: Mix = new Map();
  for (const emp of employees) {
    const funds = new Map<string, number>();
    for (const a of allocations) {
      if (a.employeeId !== emp.id || a.month !== month || !hasPercentEffort(a.percentEffort)) continue;
      const key = idToKey.get(a.fundingSourceId);
      if (!key) continue;
      funds.set(key, (funds.get(key) ?? 0) + a.percentEffort);
    }
    mix.set(emp.id, funds);
  }
  return mix;
}

function lastPositiveMonthlyComp(employeeId: string, snapshot: PayrollReportSnapshot): number {
  const months = [...snapshot.actualMonths].sort();
  for (let i = months.length - 1; i >= 0; i--) {
    const total = calculateMonthlyCost(employeeId, months[i]!, snapshot.monthlyCosts).total;
    if (total > 0) return total;
  }
  return 0;
}

function personFundBurn(
  emp: Employee,
  chartstringKey: string,
  percentEffort: number,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[],
  sources: FundingSource[],
  settings: AppSettings,
  referenceMonth: string
): number {
  if (!hasPercentEffort(percentEffort)) return 0;
  const fs = lookupFundingSource(sources, chartstringKey);
  const expected = getEffectiveExpectedPercent(emp, settings) || 100;
  const monthlyComp =
    calculateMonthlyCost(emp.id, referenceMonth, snapshot.monthlyCosts).total ||
    lastPositiveMonthlyComp(emp.id, snapshot);

  if (fs && snapshot.fundingSources.some((s) => s.id === fs.id)) {
    const months = getAllMonths(snapshot).filter((m) => m <= referenceMonth);
    const last = months[months.length - 1] ?? referenceMonth;
    const lastPct =
      allocations.find(
        (a) => a.employeeId === emp.id && a.fundingSourceId === fs.id && a.month === last
      )?.percentEffort ?? 0;
    const lastBurn = calculateEmployeeAccountMonthlyBurn(emp.id, fs.id, last, snapshot, allocations);
    if (hasPercentEffort(lastPct) && lastBurn !== 0) return lastBurn * (percentEffort / lastPct);
  }
  if (monthlyComp > 0) return monthlyComp * (percentEffort / expected);
  return 0;
}

function actualSpendTowardCap(
  emp: Employee,
  fs: FundingSource | undefined,
  fromMonth: string,
  originMonth: string,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[]
): number {
  if (!fs) return 0;
  let sum = 0;
  for (const m of getAllMonths(snapshot)) {
    if (m < fromMonth || m >= originMonth) continue;
    sum += calculateEmployeeAccountMonthlyBurn(emp.id, fs.id, m, snapshot, allocations);
  }
  return sum;
}

/**
 * Opening balance per account root.
 *
 * An account marked "not my account" opens at the estimate its end date
 * implies — burn x months remaining — not at the balance on file. The balance
 * on file is the wrong number for these twice over: some of it is restricted
 * to other uses, and some accounts run a deliberate deficit that rolls up into
 * a parent we have no sight of. Paired with counting their burn in the
 * simulation, the band draws down and reaches zero exactly at the end date.
 */
function openingBalances(
  sources: FundingSource[],
  settings: AppSettings,
  balances: Map<string, AccountBalance>,
  assumedOkEstimates: Map<string, number>
): Map<string, number> {
  const remaining = new Map<string, number>();
  const balanceMap = new Map<string, number>();
  for (const [k, v] of balances) balanceMap.set(k, v.balance);

  for (const fs of sources) {
    const key = chartstringKeyForFundingSource(fs);
    const root = chartRoot(key);
    if (remaining.has(root)) continue;

    const estimate = assumedOkEstimates.get(root);
    if (estimate !== undefined) {
      remaining.set(root, Math.max(0, estimate));
      continue;
    }

    const planned = (settings.plannedFundingSources ?? []).find((p) => p.chartstringKey === key);
    const chart = fs.accountString ?? fs.rawName;
    const matched = findBalanceForChartstring(chart, balanceMap);
    let bal = matched?.balance;
    if (bal === undefined && planned?.openingBalance !== undefined) bal = planned.openingBalance;
    if (bal === undefined) bal = 0;
    remaining.set(root, Math.max(0, bal));
  }
  return remaining;
}

/**
 * Estimated opening balance for every root someone has marked "not my
 * account", keyed by chart root. Reuses the same burn index and estimate the
 * Runway page shows per account, so the chart and that page cannot disagree.
 *
 * Where two people mark the same root with different end dates, the later one
 * wins — the account is funded until the last person stops drawing on it.
 */
function assumedOkOpeningEstimates(
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null,
  sources: FundingSource[],
  settings: AppSettings,
  estimateOriginMonth: string,
  originBurnByRoot: Map<string, number>
): Map<string, number> {
  const burnIndex = buildSharedAccountBurnIndex(snapshot, workingPlan, sources, settings);
  const monthsByRoot = new Map<string, number>();

  for (const fs of sources) {
    const root = chartRoot(chartstringKeyForFundingSource(fs));
    if (monthsByRoot.has(root)) continue;
    /**
     * Marked accounts never fall back to the balance on file — that is the
     * number this estimate exists to replace. A missing end date resolves to
     * the same default every writer of the mark applies, rather than silently
     * handing the account back to its real balance.
     */
    const endDate = effectiveAssumedEndDate(settings, root, estimateOriginMonth);
    if (!endDate) continue;
    // From today, matching computeEmployeeRunway's estimate origin. These two
    // must use the same month or the chart and the Runway page report
    // different balances for the same account.
    const months = monthsUntilAssumedEnd(estimateOriginMonth, endDate);
    if (months === null) continue;
    monthsByRoot.set(root, months);
  }

  const estimates = new Map<string, number>();
  for (const [root, months] of monthsByRoot) {
    /**
     * The projection's own origin-month burn, not the payroll index's.
     *
     * These are the same number in the ordinary case, and differ exactly when
     * it matters: the payroll's current month can lag today, a rule can have
     * already fired by origin, and the index drops any account whose
     * current-month burn is <= 0 — a residual carrying a reversal, say. In all
     * three the index says less than the grid is about to draw, so the account
     * opened underfunded and read as dry while the cells beside it still
     * showed effort charged to it.
     *
     * Funding it at the burn it will actually be charged is also what makes
     * the comment above true: draw down what you opened with and the balance
     * reaches zero on the end date, not before it.
     */
    const burn = originBurnByRoot.get(root) ?? burnIndex.get(root)?.combinedMonthlyBurn ?? 0;
    estimates.set(root, estimateBalanceFromAssumedEnd(months, burn));
  }
  return estimates;
}

/**
 * Origin-month burn per account root, from the projection's own seeded mix —
 * % distribution x salary and benefits, the same personFundBurn the drawdown
 * loop calls for every later month.
 */
function originBurnByRootFromMix(
  employees: Employee[],
  mix: Map<string, Map<string, number>>,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[],
  sources: FundingSource[],
  settings: AppSettings,
  refMonth: string
): Map<string, number> {
  const byRoot = new Map<string, number>();
  for (const emp of employees) {
    for (const [key, pct] of mix.get(emp.id) ?? []) {
      const burn = personFundBurn(emp, key, pct, snapshot, allocations, sources, settings, refMonth);
      if (burn <= 0) continue;
      const root = chartRoot(key);
      byRoot.set(root, (byRoot.get(root) ?? 0) + burn);
    }
  }
  return byRoot;
}

export function detectStaleness(
  snapshot: PayrollReportSnapshot,
  originMonth: string,
  balances: Map<string, AccountBalance>
): ProjectionStaleness {
  const last = lastPayrollMonth(snapshot);
  const payrollStale = !last || originMonth > last;
  let balanceAsOf: string | undefined;
  for (const row of balances.values()) {
    if (!balanceAsOf || row.reportRunDate > balanceAsOf) balanceAsOf = row.reportRunDate;
  }
  const balanceMonth = balanceAsOf?.slice(0, 7);
  const balancesStale = Boolean(balanceMonth && balanceMonth < originMonth);
  return {
    originMonth,
    lastPayrollMonth: last,
    payrollStale,
    balanceAsOf,
    balancesStale,
  };
}

function uniqueConflicts(conflicts: ProjectionConflict[]): ProjectionConflict[] {
  const seen = new Set<string>();
  const out: ProjectionConflict[] = [];
  for (const c of conflicts) {
    const k = `${c.employeeId}|${c.chartstringKey ?? ""}|${c.ruleId ?? ""}|${c.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function expectedOffFromRule(
  rule: ProjectionRule,
  month: string,
  capSpent: number,
  remaining: number
): boolean {
  if (rule.trigger.type === "onDate") return month > rule.trigger.month;
  if (rule.trigger.type === "setEffort") {
    return month >= rule.trigger.fromMonth && rule.trigger.percentEffort <= 0.05;
  }
  if (rule.trigger.type === "dollarCap") return capSpent >= rule.trigger.amount - 0.5;
  if (rule.trigger.type === "fundsDepleted") return remaining <= 0.5;
  return false;
}

export function simulateProjections(input: {
  snapshot: PayrollReportSnapshot;
  workingPlan: WorkingPlan | null;
  settings: AppSettings;
  balances: Map<string, AccountBalance>;
  now?: Date;
}): ProjectionResult {
  const { snapshot, workingPlan, settings, balances } = input;
  const originMonth = getProjectionOriginMonth(input.now);
  const months = resolveHorizonMonths(
    originMonth,
    settings.projectionHorizon,
    settings.fiscalYearStartMonth
  );
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const allocations = getAllocations(snapshot, workingPlan);
  const sources = projectionFundingSources(snapshot, settings);
  const idToKey = new Map(sources.map((fs) => [fs.id, chartstringKeyForFundingSource(fs)]));
  const payrollMonths = new Set(getAllMonths(snapshot));
  const lastKnown = lastMonthOnOrBefore(getAllMonths(snapshot), originMonth);
  const rules = settings.projectionRules ?? [];
  const plannedEnds = new Map(
    unmatchedPlannedSources(settings, snapshot)
      .filter((p) => p.projectEndMonth)
      .map((p) => [p.chartstringKey, p.projectEndMonth!])
  );

  const seedMonth = payrollMonths.has(originMonth) ? originMonth : lastKnown;
  let mix = seedMonth
    ? mixFromAllocations(seedMonth, employees, allocations, idToKey)
    : new Map(employees.map((e) => [e.id, new Map<string, number>()]));

  const assumedOkEstimates = assumedOkOpeningEstimates(
    snapshot,
    workingPlan,
    sources,
    settings,
    originMonth,
    originBurnByRootFromMix(
      employees,
      mix,
      snapshot,
      allocations,
      sources,
      settings,
      lastKnown ?? originMonth
    )
  );
  const remaining = openingBalances(sources, settings, balances, assumedOkEstimates);
  const conflicts: ProjectionConflict[] = [];
  const pendingOff: PendingOff[] = [];
  const capSpent = new Map<string, number>();

  for (const emp of employees) {
    const personKey = employeePersonKey(emp);
    for (const rule of rules.filter((r) => r.personKey === personKey)) {
      if (rule.trigger.type !== "dollarCap" || !rule.chartstringKey) continue;
      const fs = lookupFundingSource(sources, rule.chartstringKey);
      capSpent.set(
        rule.id,
        actualSpendTowardCap(emp, fs, rule.trigger.fromMonth, originMonth, snapshot, allocations)
      );
    }
  }

  if (!payrollMonths.has(originMonth)) {
    const fired: string[] = [];
    for (const emp of employees) {
      applyStructuralRules(
        mix,
        originMonth,
        emp,
        employeePersonKey(emp),
        settings,
        rules,
        plannedEnds,
        fired
      );
    }
  }

  for (const emp of employees) {
    const personKey = employeePersonKey(emp);
    for (const rule of rules.filter((r) => r.personKey === personKey && r.chartstringKey)) {
      const key = rule.chartstringKey!;
      const leftover = getEffort(mix, emp.id, key);
      if (leftover <= 0) continue;
      const override = Boolean(rule.applyOverPayroll) || !payrollMonths.has(originMonth);
      if (rule.trigger.type === "dollarCap" && (capSpent.get(rule.id) ?? 0) >= rule.trigger.amount - 0.5) {
        if (override) applyRemainder(mix, emp.id, key, leftover, rule.remainder);
      }
      if (rule.trigger.type === "fundsDepleted" && (remaining.get(chartRoot(key)) ?? 0) <= 0.5) {
        if (override) applyRemainder(mix, emp.id, key, leftover, rule.remainder);
      }
    }
  }

  const states: ProjectionMonthState[] = [];

  for (const month of months) {
    const fired: string[] = [];
    // After origin, ignore imported future columns. Those often stop (or attach
    // to the wrong person) while earlier months in the same file are still right.
    const knownPayroll = month <= originMonth && payrollMonths.has(month);

    for (const hit of pendingOff) {
      applyRemainder(
        mix,
        hit.employeeId,
        hit.chartstringKey,
        getEffort(mix, hit.employeeId, hit.chartstringKey),
        hit.remainder
      );
      if (!fired.includes(hit.ruleId)) fired.push(hit.ruleId);
    }
    pendingOff.length = 0;

    if (knownPayroll) {
      const payrollMix = mixFromAllocations(month, employees, allocations, idToKey);
      for (const emp of employees) {
        const personKey = employeePersonKey(emp);
        const empRules = rules.filter((r) => r.personKey === personKey);
        const merged = new Map(payrollMix.get(emp.id) ?? []);

        for (const rule of empRules) {
          if (!rule.chartstringKey) continue;
          const payrollPct = merged.get(rule.chartstringKey) ?? 0;
          const remainingHere = remaining.get(chartRoot(rule.chartstringKey)) ?? 0;
          const spent = capSpent.get(rule.id) ?? 0;
          const shouldBeOff = expectedOffFromRule(rule, month, spent, remainingHere);
          const setEffortMismatch =
            rule.trigger.type === "setEffort" &&
            month >= rule.trigger.fromMonth &&
            Math.abs(payrollPct - rule.trigger.percentEffort) > 0.5;

          if (rule.applyOverPayroll && (shouldBeOff || setEffortMismatch || rule.trigger.type === "setEffort")) {
            continue;
          }

          if (month === originMonth && payrollPct > 0.05 && shouldBeOff) {
            conflicts.push({
              personKey,
              employeeId: emp.id,
              employeeName: emp.name,
              chartstringKey: rule.chartstringKey,
              ruleId: rule.id,
              message: `Rule would take this off, but payroll still shows ${payrollPct.toFixed(0)}% in ${month}.`,
            });
          } else if (month === originMonth && setEffortMismatch) {
            conflicts.push({
              personKey,
              employeeId: emp.id,
              employeeName: emp.name,
              chartstringKey: rule.chartstringKey,
              ruleId: rule.id,
              message: `Rule sets ${rule.trigger.type === "setEffort" ? rule.trigger.percentEffort.toFixed(0) : 0}% but payroll still shows ${payrollPct.toFixed(0)}% in ${month}.`,
            });
          }
        }

        mix.set(emp.id, merged);
        applyStructuralRules(
          mix,
          month,
          emp,
          personKey,
          settings,
          empRules.filter((r) => r.applyOverPayroll),
          plannedEnds,
          fired
        );

        const endMo = employmentEndMonth(emp, settings, personKey, empRules);
        if (endMo && month > endMo) {
          const stillOn = [...(mix.get(emp.id)?.values() ?? [])].some((p) => p > 0);
          const overrideEmp = empRules.some((r) => !r.chartstringKey && r.applyOverPayroll);
          if (stillOn && month === originMonth && !overrideEmp) {
            conflicts.push({
              personKey,
              employeeId: emp.id,
              employeeName: emp.name,
              ruleId: empRules.find((r) => !r.chartstringKey)?.id,
              message: `Employment ended ${endMo}, but payroll still shows effort in ${month}.`,
            });
          }
          if (overrideEmp) zeroEmployee(mix, emp.id);
        }
      }
    } else {
      mix = cloneMix(mix);
      dropReversalEffort(mix);
      for (const emp of employees) {
        applyStructuralRules(
          mix,
          month,
          emp,
          employeePersonKey(emp),
          settings,
          rules,
          plannedEnds,
          fired
        );
      }
    }

    const monthAllocs: ProjectionAllocation[] = [];
    const burnByRoot = new Map<string, number>();
    const refMonth = lastKnown ?? month;

    for (const emp of employees) {
      const personKey = employeePersonKey(emp);
      for (const [key, pct] of mix.get(emp.id) ?? []) {
        const fs = lookupFundingSource(sources, key);
        const burn = personFundBurn(emp, key, pct, snapshot, allocations, sources, settings, refMonth);
        monthAllocs.push({
          employeeId: emp.id,
          personKey,
          chartstringKey: key,
          fundingSourceId: fs?.id ?? key,
          percentEffort: pct,
          monthlyBurn: burn,
        });
        // Assumed-OK burn counts. It used to be skipped, which — combined with
        // opening at the real balance — drew a band that never declined: the
        // infinite runway this is meant to rule out. The account now opens at
        // its estimate and burns to zero at its end date.
        if (burn !== 0) {
          const root = chartRoot(key);
          burnByRoot.set(root, (burnByRoot.get(root) ?? 0) + burn);
        }
      }
    }

    for (const [root, burn] of burnByRoot) {
      remaining.set(root, Math.max(0, (remaining.get(root) ?? 0) - burn));
    }

    const queued = new Set<string>();
    for (const emp of employees) {
      const personKey = employeePersonKey(emp);
      for (const rule of rules.filter((r) => r.personKey === personKey && r.chartstringKey)) {
        const key = rule.chartstringKey!;
        const pct = getEffort(mix, emp.id, key);
        const alloc = monthAllocs.find((a) => a.employeeId === emp.id && a.chartstringKey === key);
        const burn = alloc?.monthlyBurn ?? 0;
        const queueKey = `${emp.id}|${key}|${rule.id}`;

        if (rule.trigger.type === "dollarCap") {
          const spent = (capSpent.get(rule.id) ?? 0) + burn;
          capSpent.set(rule.id, spent);
          if (spent >= rule.trigger.amount - 0.5 && pct > 0 && !queued.has(queueKey)) {
            pendingOff.push({
              employeeId: emp.id,
              chartstringKey: key,
              remainder: rule.remainder,
              ruleId: rule.id,
            });
            queued.add(queueKey);
            if (!fired.includes(rule.id)) fired.push(rule.id);
          }
        }
        if (rule.trigger.type === "fundsDepleted") {
          const left = remaining.get(chartRoot(key)) ?? 0;
          if (left <= 0.5 && pct > 0 && !queued.has(queueKey)) {
            pendingOff.push({
              employeeId: emp.id,
              chartstringKey: key,
              remainder: rule.remainder,
              ruleId: rule.id,
            });
            queued.add(queueKey);
            if (!fired.includes(rule.id)) fired.push(rule.id);
          }
        }
      }
    }

    const coverageByEmployee: ProjectionMonthState["coverageByEmployee"] = {};
    for (const emp of employees) {
      const fakeAllocs: MonthlyAllocation[] = [...(mix.get(emp.id) ?? new Map())].map(
        ([key, pct]) => ({
          id: `${emp.id}|${key}|${month}`,
          employeeId: emp.id,
          fundingSourceId: lookupFundingSource(sources, key)?.id ?? key,
          month,
          percentEffort: pct,
          sourceType: "future",
          status: "scenario",
        })
      );
      const cov = calculateEmployeeCoverage(
        emp,
        month,
        fakeAllocs,
        coverageOptionsFromSettings(emp, settings)
      );
      coverageByEmployee[emp.id] = {
        expectedPercent: cov.expectedPercent,
        allocatedPercent: cov.allocatedPercent,
        unallocatedPercent: cov.unallocatedPercent,
        overallocatedPercent: cov.overallocatedPercent,
        status: cov.status,
      };
    }

    const remainingByRoot: Record<string, number> = {};
    for (const [k, v] of remaining) remainingByRoot[k] = v;

    states.push({
      month,
      allocations: monthAllocs,
      remainingByRoot,
      coverageByEmployee,
      firedRuleIds: fired,
    });
  }

  return {
    originMonth,
    months,
    states,
    conflicts: uniqueConflicts(conflicts),
    staleness: detectStaleness(snapshot, originMonth, balances),
    sources,
  };
}

export function mixForEmployeeMonth(
  result: ProjectionResult,
  employeeId: string,
  month: string
): ProjectionAllocation[] {
  const state = result.states.find((s) => s.month === month);
  return state?.allocations.filter((a) => a.employeeId === employeeId) ?? [];
}
