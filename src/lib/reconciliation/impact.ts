import type { AppSettings, Employee, PayrollReportSnapshot, ReconciliationChoice, WorkingPlan } from "@/types";
import type { AccountBalance } from "@/lib/funding/accountBalances";
import { depletionMonthIndexForRoot, depletionRootOf } from "@/lib/projections/depletion";
import { simulateProjections, type ProjectionResult } from "@/lib/projections/simulate";
import { applyLink } from "@/lib/reconciliation/mutations";
import { personKeyForEmployee, plannedPersonKey } from "@/lib/reconciliation/plans";

export interface AccountImpact {
  chartstringKey: string;
  root: string;
  label: string;
  /** First month the account is projected dry, or null when it holds through the horizon. */
  dryToday: string | null;
  dryAfter: string | null;
}

export interface LinkImpact {
  /** The horizon both columns cover. */
  months: { from: string; to: string };
  /** What the grid counts today: the person's imported burn plus the plan's own. */
  personImportedToday: number;
  personPlannedToday: number;
  personTotalToday: number;
  /** The person's burn once the link is in force. */
  personTotalAfter: number;
  accounts: AccountImpact[];
}

function sumBurn(result: ProjectionResult, pick: (a: { employeeId: string; personKey: string }) => boolean): number {
  let total = 0;
  for (const state of result.states) {
    for (const a of state.allocations) if (pick(a)) total += a.monthlyBurn;
  }
  return total;
}

/**
 * The link dialog's "Counted today" vs "After this link": two runs of the
 * canonical engine, exactly as buildChangeSummary diffs a handoff — once as
 * the grid stands, once with the link and its choices applied to a copy of
 * settings. Nothing here derives a figure; it only sums the engine's
 * monthlyBurn and reads its depletion months.
 */
export function buildLinkImpact(input: {
  snapshot: PayrollReportSnapshot;
  workingPlan: WorkingPlan | null;
  settings: AppSettings;
  balances: Map<string, AccountBalance>;
  plannedHireId: string;
  employee: Employee;
  choice: Pick<ReconciliationChoice, "forecastRate" | "pinPlannedRate" | "distribution">;
  labelForKey: (chartstringKey: string) => string;
  now?: Date;
}): LinkImpact {
  const { snapshot, workingPlan, settings, balances, plannedHireId, employee, choice, now } = input;
  const today = simulateProjections({ snapshot, workingPlan, settings, balances, now });
  const linked = applyLink(settings, {
    plannedHireId,
    employeePersonKey: personKeyForEmployee(employee),
    employeeName: employee.name,
    basis: "manual",
    signals: [],
    choice,
    by: "preview",
    originMonth: today.originMonth,
  });
  const after = linked.ok
    ? simulateProjections({ snapshot, workingPlan, settings: linked.settings, balances, now })
    : today;

  const planKey = plannedPersonKey(plannedHireId);
  const personImportedToday = sumBurn(today, (a) => a.employeeId === employee.id);
  const personPlannedToday = sumBurn(today, (a) => a.personKey === planKey);
  const personTotalAfter = sumBurn(after, (a) => a.employeeId === employee.id);

  const keys = new Set<string>();
  for (const result of [today, after]) {
    for (const state of result.states) {
      for (const a of state.allocations) {
        if (a.employeeId === employee.id || a.personKey === planKey) keys.add(a.chartstringKey);
      }
    }
  }
  const accounts: AccountImpact[] = [...keys].sort().map((key) => {
    const root = depletionRootOf(key);
    const di = depletionMonthIndexForRoot(today, root);
    const da = depletionMonthIndexForRoot(after, root);
    return {
      chartstringKey: key,
      root,
      label: input.labelForKey(key),
      dryToday: di === null ? null : (today.months[di] ?? null),
      dryAfter: da === null ? null : (after.months[da] ?? null),
    };
  });

  return {
    months: { from: today.months[0] ?? today.originMonth, to: today.months[today.months.length - 1] ?? today.originMonth },
    personImportedToday,
    personPlannedToday,
    personTotalToday: personImportedToday + personPlannedToday,
    personTotalAfter,
    accounts,
  };
}
