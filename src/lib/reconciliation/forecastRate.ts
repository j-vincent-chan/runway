import type {
  AppSettings,
  Employee,
  PayrollReportSnapshot,
  PlannedHire,
  ReconciliationChoice,
  ReconciliationEvent,
} from "@/types";
import { calculateMonthlyCost } from "@/lib/calculations";
import { formatMonthLabel } from "@/lib/projections/horizon";
import { formatCurrency } from "@/lib/utils/parse";
import { latestClosedFullMonth } from "@/lib/reconciliation/closure";
import { makeEvent } from "@/lib/reconciliation/events";
import { choiceForLink, effectiveLinks, findEmployeeByPersonKey } from "@/lib/reconciliation/links";
import { plannedHireById, plannedMonthlyComp } from "@/lib/reconciliation/plans";

export type ForecastRateSource =
  | "pinnedPlanned"
  | "closedMonth"
  | "fyRate"
  | "payrollActual"
  | "planned";

export interface ForecastRate {
  source: ForecastRateSource;
  /** Monthly salary and benefits; null means "carry the posted amount" — the payroll-derived path. */
  monthlyRate: number | null;
  /** The closed month a closedMonth rate is 12× of. */
  sourceMonth?: string;
}

/** The Position Salary report's annual rate, stamped on the employee by the overlay. */
export function fyRateAvailable(employee: Pick<Employee, "annualSalary">): boolean {
  return (employee.annualSalary ?? 0) > 0;
}

/**
 * What the choice resolves to while no full payroll month has closed.
 * Separated out so a rate switch can name the rate it replaced.
 */
function preClosureRate(
  plan: PlannedHire,
  employee: Employee,
  choice: ReconciliationChoice | undefined
): ForecastRate {
  const planned = plannedMonthlyComp(plan);
  if (choice?.pinPlannedRate) return { source: "pinnedPlanned", monthlyRate: planned };
  if (choice?.forecastRate === "fyRate" && fyRateAvailable(employee)) {
    return {
      source: "fyRate",
      monthlyRate: plannedMonthlyComp({
        annualSalary: employee.annualSalary!,
        benefitsRatePct: plan.benefitsRatePct,
      }),
    };
  }
  if (choice?.forecastRate === "payrollActual") return { source: "payrollActual", monthlyRate: null };
  return { source: "planned", monthlyRate: planned };
}

/**
 * Forecast rate for a linked person, months after origin. In order: a pinned
 * planned rate; else the latest closed full payroll month (12× posted salary
 * and benefits — one month's total, the canonical calculateMonthlyCost); else
 * the FY rate from the Position Salary report at the plan's benefits %; else
 * the planned rate. "Carry the posted amount" is the existing payroll-derived
 * path and returns no rate of its own.
 */
export function resolveForecastRate(input: {
  plan: PlannedHire;
  employee: Employee;
  snapshot: PayrollReportSnapshot;
  choice: ReconciliationChoice | undefined;
}): ForecastRate {
  const { plan, employee, snapshot, choice } = input;
  if (choice?.pinPlannedRate) {
    return { source: "pinnedPlanned", monthlyRate: plannedMonthlyComp(plan) };
  }
  const closed = latestClosedFullMonth(snapshot, employee.id);
  if (closed) {
    return {
      source: "closedMonth",
      monthlyRate: calculateMonthlyCost(employee.id, closed, snapshot.monthlyCosts).total,
      sourceMonth: closed,
    };
  }
  return preClosureRate(plan, employee, choice);
}

export function forecastRateSourceLabel(rate: ForecastRate): string {
  switch (rate.source) {
    case "pinnedPlanned":
      return "planned rate, pinned";
    case "closedMonth":
      return `12× ${rate.sourceMonth ? formatMonthLabel(rate.sourceMonth) : "closed month"} posted salary and benefits`;
    case "fyRate":
      return "FY rate from the Employee and Position Salary Report";
    case "payrollActual":
      return "posted amount carried forward";
    default:
      return "planned rate";
  }
}

/**
 * A link made when a closed full month already exists never "switches": the
 * closed-month rate is in force from the first forecast month. This records
 * that as the link's rateSwitch row, naming the report it came from, so the
 * next import cannot write a switch from a planned rate that was never used.
 * Null when nothing is closed yet, or the rate is pinned.
 */
export function rateAtLinkEvent(input: {
  plan: PlannedHire;
  employee: Employee;
  snapshot: PayrollReportSnapshot;
  linkId: string;
  choice: ReconciliationChoice | undefined;
  by: string;
  at?: string;
}): ReconciliationEvent | null {
  const { plan, employee, snapshot, linkId, choice, by } = input;
  if (choice?.pinPlannedRate) return null;
  const rate = resolveForecastRate({ plan, employee, snapshot, choice });
  if (rate.source !== "closedMonth" || rate.monthlyRate === null || !rate.sourceMonth) return null;
  return makeEvent(
    "rateSwitch",
    `Forecast rate for ${employee.name} is ${formatCurrency(rate.monthlyRate)}/mo from the link — ${forecastRateSourceLabel(
      rate
    )}, already closed when linked (${snapshot.sourceFileName}).`,
    by,
    {
      linkId,
      plannedHireId: plan.id,
      detail: {
        oldSource: "none",
        oldRate: "",
        newRate: rate.monthlyRate,
        sourceMonth: rate.sourceMonth,
        reportFile: snapshot.sourceFileName,
      },
    },
    input.at
  );
}

/**
 * The automatic switch (owner decision 1): when a report arrives whose first
 * closed full month covers a linked person, the forecast rate becomes that
 * month's posted salary and benefits, and one rateSwitch event records the
 * old rate, the new rate, the source month and the file. Pinned links never
 * switch; a link that has already switched never switches again — later
 * closed months update the rate silently, as everyone's burn tracks payroll.
 * Pure: the caller appends what this returns.
 */
export function rateSwitchEventsForImport(input: {
  snapshot: PayrollReportSnapshot;
  settings: AppSettings;
  by: string;
  reportFile: string;
  at?: string;
}): ReconciliationEvent[] {
  const { snapshot, settings, by, reportFile } = input;
  const links = effectiveLinks(settings, snapshot.employees);
  const switched = new Set(
    (settings.reconciliationEvents ?? [])
      .filter((e) => e.type === "rateSwitch" && e.linkId)
      .map((e) => e.linkId!)
  );
  const events: ReconciliationEvent[] = [];
  for (const link of links) {
    if (switched.has(link.id)) continue;
    const plan = plannedHireById(settings.plannedHires, link.plannedHireId);
    const employee = findEmployeeByPersonKey(snapshot.employees, link.employeePersonKey);
    if (!plan || !employee) continue;
    const choice = choiceForLink(settings, link.id);
    if (choice?.pinPlannedRate) continue;
    const next = resolveForecastRate({ plan, employee, snapshot, choice });
    if (next.source !== "closedMonth" || next.monthlyRate === null || !next.sourceMonth) continue;
    const previous = preClosureRate(plan, employee, choice);
    const oldLabel =
      previous.monthlyRate === null
        ? "the posted amount carried forward"
        : `~${formatCurrency(previous.monthlyRate)}/mo (${forecastRateSourceLabel(previous)})`;
    events.push(
      makeEvent(
        "rateSwitch",
        `Forecast rate for ${employee.name} switched from ${oldLabel} to ${formatCurrency(
          next.monthlyRate
        )}/mo — ${forecastRateSourceLabel(next)} (${reportFile}).`,
        by,
        {
          linkId: link.id,
          plannedHireId: plan.id,
          detail: {
            oldSource: previous.source,
            oldRate: previous.monthlyRate ?? "",
            newRate: next.monthlyRate,
            sourceMonth: next.sourceMonth,
            reportFile,
          },
        },
        input.at
      )
    );
  }
  return events;
}
