import { CAUTION_MONTHS, totalFundedRoots, type RunwayContext } from "@/lib/dashboard/attention";
import { employeeGroupKey, groupLabel } from "@/lib/dashboard/metrics";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import { getPersonnelGroups } from "@/lib/employees/personnelType";
import { resolveEmployeeProfile } from "@/lib/employees/stableKey";
import { shiftMonth } from "@/lib/dashboard/month";
import type { AppSettings, Employee, PayrollReportSnapshot } from "@/types";

/** Key of the roll-up row covering everyone, whether or not teams exist. */
export const ALL_TEAMS_KEY = "all";

export interface TeamRunwayMember {
  name: string;
  months: number;
  month: string;
  photoUrl: string | null;
}

export interface TeamRunwayRow {
  key: string;
  label: string;
  memberCount: number;
  funds: number;
  monthlyBurn: number;
  months: number | null;
  /** Month the team's blended funding runs out, when it does so in view. */
  targetMonth: string | null;
  /** The member who runs short first, when someone does so inside the caution window. */
  firstShort: TeamRunwayMember | null;
  /** A balance in this row came from an assumed-OK fund's end-date estimate. */
  hasEstimatedFunds: boolean;
}

function memberRow(
  key: string,
  label: string,
  members: Employee[],
  runway: RunwayContext,
  settings: AppSettings,
  planningMonth: string
): TeamRunwayRow {
  // Union of the accounts this team draws on, so an account two members share
  // is counted once — the same dedupe computeEmployeeRunway does per person.
  const roots = new Set<string>();
  for (const member of members) {
    for (const root of runway.rootsByEmployee.get(member.id) ?? []) roots.add(root);
  }

  const funded = totalFundedRoots(
    [...roots].map((root) => runway.fundedRoots.get(root)).filter((r) => r !== undefined)
  );

  let firstShort: TeamRunwayMember | null = null;
  for (const member of members) {
    const months = runway.monthsByEmployee.get(member.id);
    if (months === null || months === undefined || months >= CAUTION_MONTHS) continue;
    if (firstShort && months >= firstShort.months) continue;
    firstShort = {
      name: member.name,
      months,
      month: shiftMonth(planningMonth, Math.floor(Math.max(months, 0))),
      photoUrl: resolveEmployeeProfile(settings, member)?.photoUrl ?? null,
    };
  }

  return {
    key,
    label,
    memberCount: members.length,
    funds: funded.balance,
    monthlyBurn: funded.monthlyBurn,
    months: funded.months,
    targetMonth:
      funded.months !== null && funded.months >= 0
        ? shiftMonth(planningMonth, Math.floor(funded.months))
        : null,
    firstShort,
    hasEstimatedFunds: funded.hasEstimated,
  };
}

/**
 * Runway per team, plus an `all` roll-up. Each row is the team's own funds over
 * the burn on those same accounts — the same balance ÷ burn shape used
 * everywhere else, never a re-derivation.
 *
 * The denominator is each account's *combined* burn, including charges from
 * people outside the team. Apportioning a shared account between teams would
 * mean inventing a split rule, so instead the shared cost stays whole and a
 * team sharing an account reads as shorter than it would in isolation — the
 * conservative direction. `DashboardMethodology` states this.
 */
export function buildTeamRunway({
  runway,
  snapshot,
  settings,
  planningMonth,
}: {
  runway: RunwayContext;
  snapshot: PayrollReportSnapshot;
  settings: AppSettings;
  planningMonth: string;
}): TeamRunwayRow[] {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);

  const byTeam = new Map<string, Employee[]>();
  for (const employee of employees) {
    const key = employeeGroupKey(settings, employee.id);
    const bucket = byTeam.get(key) ?? [];
    bucket.push(employee);
    byTeam.set(key, bucket);
  }

  // Catalog order first so a team's position is stable, then any key the
  // catalog doesn't know about (legacy ids), then unassigned last.
  const catalogKeys = getPersonnelGroups(settings).map((g) => g.id);
  const orderedKeys = [
    ...catalogKeys.filter((key) => byTeam.has(key)),
    ...[...byTeam.keys()].filter((key) => key !== "unassigned" && !catalogKeys.includes(key)),
    ...(byTeam.has("unassigned") ? ["unassigned"] : []),
  ];

  const teams = orderedKeys.map((key) =>
    memberRow(key, groupLabel(settings, key), byTeam.get(key)!, runway, settings, planningMonth)
  );
  teams.sort((a, b) => b.monthlyBurn - a.monthlyBurn);

  return [
    ...teams,
    memberRow(ALL_TEAMS_KEY, "All teams", employees, runway, settings, planningMonth),
  ];
}
