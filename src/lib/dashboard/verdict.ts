import { monthLabelLong, shiftMonth } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import type { AccountAtRisk, PersonAtRisk } from "@/lib/dashboard/attention";

export type VerdictKind =
  | "at_risk"
  | "healthy"
  | "beyond_horizon"
  | "overdrawn"
  | "insufficient_data";

/** Data terms render in --ink; connective words in --ink-2. */
export type SegmentEmphasis = "data" | "connective";

export interface VerdictSegment {
  text: string;
  emphasis: SegmentEmphasis;
}

export interface VerdictClause {
  segments: VerdictSegment[];
  tone?: "healthy";
}

export interface VerdictMissing {
  message: string;
  href: string;
  hrefLabel: string;
}

export interface Verdict {
  kind: VerdictKind;
  clauses: VerdictClause[];
  /** Set when the funded-through month should link into Runway. */
  runwayMonth: string | null;
  missing: VerdictMissing | null;
}

function data(text: string): VerdictSegment {
  return { text, emphasis: "data" };
}

function connective(text: string): VerdictSegment {
  return { text, emphasis: "connective" };
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Reads "2 people and 1 account fall short before then." — and omits either
 * side entirely at zero rather than emitting "and 0 accounts".
 */
function shortfallClause(people: number, accounts: number): VerdictClause | null {
  if (people === 0 && accounts === 0) return null;

  const segments: VerdictSegment[] = [];
  if (people > 0) segments.push(data(pluralize(people, "person", "people")));
  if (people > 0 && accounts > 0) segments.push(connective(" and "));
  if (accounts > 0) segments.push(data(pluralize(accounts, "account", "accounts")));

  const verb = people + accounts === 1 ? " falls short before then." : " fall short before then.";
  segments.push(connective(verb));
  return { segments };
}

function fundedThroughClause(month: string): VerdictClause {
  return {
    segments: [
      connective("Funded through "),
      data(monthLabelLong(month)),
      connective(" at your current rate."),
    ],
  };
}

function fundedPastClause(month: string): VerdictClause {
  return {
    segments: [
      connective("Funded past "),
      data(monthLabelLong(month)),
      connective(" at your current rate."),
    ],
  };
}

export function buildVerdict({
  planningMonth,
  horizonMonths,
  runwayMonths,
  hasFunds,
  hasBurn,
  peopleAtRisk,
  accountsAtRisk,
  overdrawnAccounts,
}: {
  planningMonth: string;
  horizonMonths: number;
  runwayMonths: number | null;
  hasFunds: boolean;
  hasBurn: boolean;
  peopleAtRisk: PersonAtRisk[];
  accountsAtRisk: AccountAtRisk[];
  overdrawnAccounts: AccountAtRisk[];
}): Verdict {
  if (!hasFunds || !hasBurn || runwayMonths === null) {
    const missing = !hasFunds
      ? {
          message:
            "No account balances have been imported, so there is nothing to project against.",
          href: "/upload",
          hrefLabel: "Upload a Net Position or MyPortfolio file",
        }
      : {
          message:
            "No personnel costs were found in the payroll report, so there is no burn rate to project with.",
          href: "/upload",
          hrefLabel: "Upload a Payroll Funding Report",
        };

    return {
      kind: "insufficient_data",
      clauses: [{ segments: [connective("Not enough data to project runway.")] }],
      runwayMonth: null,
      missing,
    };
  }

  const shortfall = shortfallClause(peopleAtRisk.length, accountsAtRisk.length);

  if (overdrawnAccounts.length > 0) {
    const worst = overdrawnAccounts[0]!;
    const lead: VerdictSegment[] =
      overdrawnAccounts.length === 1
        ? [
            data(worst.name),
            connective(" is overdrawn by "),
            data(formatCurrency(Math.abs(worst.balance))),
            connective("."),
          ]
        : [
            data(worst.name),
            connective(" and "),
            data(pluralize(overdrawnAccounts.length - 1, "other account", "other accounts")),
            connective(" are overdrawn."),
          ];

    const beyond = runwayMonths > horizonMonths;
    const followOn = beyond
      ? fundedPastClause(shiftMonth(planningMonth, horizonMonths))
      : fundedThroughClause(shiftMonth(planningMonth, Math.floor(runwayMonths)));

    return {
      kind: "overdrawn",
      clauses: [{ segments: lead }, followOn],
      runwayMonth: beyond ? null : shiftMonth(planningMonth, Math.floor(runwayMonths)),
      missing: null,
    };
  }

  // Never extrapolate a date past the projection horizon.
  if (runwayMonths > horizonMonths) {
    const horizonEnd = shiftMonth(planningMonth, horizonMonths);
    return {
      kind: "beyond_horizon",
      clauses: shortfall
        ? [fundedPastClause(horizonEnd), shortfall]
        : [
            fundedPastClause(horizonEnd),
            {
              segments: [connective("No one runs short in that window.")],
              tone: "healthy" as const,
            },
          ],
      runwayMonth: null,
      missing: null,
    };
  }

  const targetMonth = shiftMonth(planningMonth, Math.floor(Math.max(runwayMonths, 0)));

  if (!shortfall) {
    return {
      kind: "healthy",
      clauses: [
        fundedThroughClause(targetMonth),
        {
          segments: [connective("No one runs short in that window.")],
          tone: "healthy" as const,
        },
      ],
      runwayMonth: targetMonth,
      missing: null,
    };
  }

  return {
    kind: "at_risk",
    clauses: [fundedThroughClause(targetMonth), shortfall],
    runwayMonth: targetMonth,
    missing: null,
  };
}

/** Flattened sentence, for aria-labels and tests. */
export function verdictText(verdict: Verdict): string {
  return verdict.clauses
    .map((clause) => clause.segments.map((s) => s.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
