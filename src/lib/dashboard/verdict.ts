import { CAUTION_MONTHS, CRITICAL_MONTHS, type AttentionQueue } from "@/lib/dashboard/attention";
import { ALL_TEAMS_KEY, type TeamRunwayRow } from "@/lib/dashboard/teamRunway";

/**
 * Severity of the whole program, driven by whichever team is weakest.
 * Mirrors the attention queue's thresholds so the hero and the rows beneath
 * it can never disagree about what counts as urgent.
 */
export type VerdictStatus = "critical" | "at_risk" | "stable" | "insufficient_data";

/** Data terms render in --ink; connective words in --ink-2. */
export type SegmentEmphasis = "data" | "connective";

export interface VerdictSegment {
  text: string;
  emphasis: SegmentEmphasis;
  /** Set on the named team so it links into its own detail. */
  href?: string;
}

export interface VerdictClause {
  segments: VerdictSegment[];
}

export interface VerdictMissing {
  message: string;
  href: string;
  hrefLabel: string;
}

export interface Verdict {
  status: VerdictStatus;
  /** Chip text. Never carried by color alone. */
  statusLabel: string;
  /** The finding: names the weakest team and its runway. */
  finding: VerdictClause;
  /** Whether money or a burn cut is needed now. Absent only when data is missing. */
  action: string | null;
  /** Key of the team driving the status, when a team does. */
  weakestTeamKey: string | null;
  missing: VerdictMissing | null;
}

function data(text: string, href?: string): VerdictSegment {
  return href ? { text, emphasis: "data", href } : { text, emphasis: "data" };
}

function connective(text: string): VerdictSegment {
  return { text, emphasis: "connective" };
}

/**
 * Prose months, not the compact `runwayMonthsLabel` used in stat slots — this
 * reads inside a sentence. Deficits never reach here; they are stated as
 * "already overdrawn" instead, since a negative month count is not a duration.
 */
export function monthsPhrase(months: number): string {
  if (months < 1) return "less than a month";
  const rounded = Number(months.toFixed(1));
  if (rounded === 1) return "1 month";
  return `${rounded.toFixed(1)} months`;
}

const STATUS_LABEL: Record<Exclude<VerdictStatus, "insufficient_data">, string> = {
  critical: "Critical",
  at_risk: "At Risk",
  stable: "Stable",
};

/**
 * States whether money or a burn cut is needed now — the two levers a PI
 * actually has. Deliberately does not prescribe which: Runway cannot know
 * whether a transfer, a re-budget, or an effort change is the right remedy,
 * and inventing one would be advice the data doesn't support.
 */
function actionFor(
  status: Exclude<VerdictStatus, "insufficient_data">,
  shortTeamCount: number
): string {
  const subject = shortTeamCount > 1 ? "them" : "it";
  const possessive = shortTeamCount > 1 ? "their" : "its";
  switch (status) {
    case "critical":
      return `Move money onto ${subject} or cut ${possessive} burn now.`;
    case "at_risk":
      return `Line up funding or trim burn this quarter, before ${shortTeamCount > 1 ? "they turn" : "it turns"} critical.`;
    case "stable":
      return "No funding action needed right now.";
  }
}

const SEVERITY_RANK: Record<Exclude<VerdictStatus, "insufficient_data">, number> = {
  stable: 0,
  at_risk: 1,
  critical: 2,
};

function statusFor(months: number): Exclude<VerdictStatus, "insufficient_data"> {
  if (months < CRITICAL_MONTHS) return "critical";
  if (months < CAUTION_MONTHS) return "at_risk";
  return "stable";
}

/** Teams with a real runway figure, weakest first. Teams with no burn can't be ranked. */
function rankTeams(teamRows: TeamRunwayRow[]): TeamRunwayRow[] {
  return teamRows
    .filter((r) => r.key !== ALL_TEAMS_KEY && r.months !== null)
    .sort((a, b) => a.months! - b.months!);
}

/**
 * "{Team} is already overdrawn" / "{Team} has 1.5 months of payroll runway".
 * `trailing: false` drops "of payroll runway" for a second team in the same
 * sentence, where repeating the unit reads as a stutter.
 */
function teamState(row: TeamRunwayRow, { trailing = true }: { trailing?: boolean } = {}): VerdictSegment[] {
  const name = data(row.shortLabel, "/runway");
  if (row.months! < 0) {
    return [name, connective(" is already overdrawn")];
  }
  return [
    name,
    connective(" has "),
    data(monthsPhrase(row.months!)),
    ...(trailing ? [connective(" of payroll runway")] : []),
  ];
}

/**
 * Where the program stands, stated before anything that threatens it.
 *
 * The hero's whole job is that a reader who reads only this sentence learns
 * whether the program is solvent. Leading with the sharpest fact answered
 * "what is wrong" while never answering "how am I doing" — so the position
 * leads even when a sharper fact is what sets the severity.
 */
function positionClause(overallRunwayMonths: number): VerdictSegment[] {
  if (overallRunwayMonths < 0) {
    return [connective("Your payroll accounts are "), data("already overdrawn")];
  }
  return [
    connective("Payroll is funded about "),
    data(monthsPhrase(overallRunwayMonths)),
    connective(" out"),
  ];
}

/** "runs dry in 1.5 months" / "is already overdrawn" for a queue item. */
function itemState(item: WorstItem): VerdictSegment[] {
  if (item.months < 0) {
    return [data(item.label, "/runway"), connective(" is already overdrawn")];
  }
  return [
    data(item.label, "/runway"),
    connective(" runs dry in "),
    data(monthsPhrase(item.months)),
  ];
}

/** The soonest single account or person to run dry, from the attention queue. */
export interface WorstItem {
  label: string;
  months: number;
}

/**
 * The item the queue itself ranks first, so the hero and the list beneath it
 * always name the same account or person — several can tie on months, and
 * re-deriving the worst here would break those ties differently. Data-quality
 * rows are skipped: an uncategorized charge is not a funding cliff.
 */
export function pickWorstItem(queue: AttentionQueue): WorstItem | null {
  const row = queue.rows.find((r) => r.severity !== "data");
  return row ? { label: row.entity, months: row.months } : null;
}

export function buildVerdict({
  teamRows,
  overallRunwayMonths,
  worstItem,
  hasFunds,
  hasBurn,
}: {
  /** Rows from buildTeamRunway, roll-up included; it is filtered out here. */
  teamRows: TeamRunwayRow[];
  /** Whole-roster runway, used when no team has been set up. */
  overallRunwayMonths: number | null;
  /**
   * Team runway is an average, so a team can read healthy while one of its
   * accounts is nearly dry. Passing the worst individual item keeps the hero
   * from ever declaring safety above a critical row.
   */
  worstItem: WorstItem | null;
  hasFunds: boolean;
  hasBurn: boolean;
}): Verdict {
  if (!hasFunds || !hasBurn || overallRunwayMonths === null) {
    return {
      status: "insufficient_data",
      statusLabel: "Not enough data",
      finding: {
        segments: [connective("There isn't enough on file to judge your funding position.")],
      },
      action: null,
      weakestTeamKey: null,
      missing: !hasFunds
        ? {
            message:
              "No account balances have been imported, so there is nothing to measure runway against.",
            href: "/upload",
            hrefLabel: "Upload a Net Position Report",
          }
        : {
            message:
              "No personnel costs were found in the payroll report, so there is no burn rate to measure against.",
            href: "/upload",
            hrefLabel: "Upload a Payroll Funding Report",
          },
    };
  }

  const ranked = rankTeams(teamRows);

  // No teams set up (or none with burn): the roll-up is the only honest subject.
  if (ranked.length === 0) {
    const rollupStatus = statusFor(overallRunwayMonths);
    const itemStatus = worstItem ? statusFor(worstItem.months) : "stable";

    // Same averaging trap as the team path: the roll-up can look fine while one
    // account is nearly dry, so the sharper fact leads when there is one.
    if (SEVERITY_RANK[itemStatus] > SEVERITY_RANK[rollupStatus] && worstItem) {
      return {
        status: itemStatus,
        statusLabel: STATUS_LABEL[itemStatus],
        finding: {
          segments: [
            ...positionClause(overallRunwayMonths),
            connective(", but "),
            ...itemState(worstItem),
            connective("."),
          ],
        },
        action: actionFor(itemStatus, 1),
        weakestTeamKey: null,
        missing: null,
      };
    }

    const segments: VerdictSegment[] = [
      ...positionClause(overallRunwayMonths),
      connective("."),
    ];
    return {
      status: rollupStatus,
      statusLabel: STATUS_LABEL[rollupStatus],
      finding: { segments },
      action: actionFor(rollupStatus, 0),
      weakestTeamKey: null,
      missing: null,
    };
  }

  const weakest = ranked[0]!;
  const teamStatus = statusFor(weakest.months!);
  const itemStatus = worstItem ? statusFor(worstItem.months) : "stable";

  /**
   * An account or person running dry sooner than any team average outranks the
   * team view. Leading with the team here would put "no action needed" directly
   * above a critical row — the averaging is exactly what "Avg payroll runway"
   * warns about, so the hero names the sharper fact instead.
   */
  if (SEVERITY_RANK[itemStatus] > SEVERITY_RANK[teamStatus] && worstItem) {
    const segments: VerdictSegment[] = [
      ...positionClause(overallRunwayMonths),
      connective(", but "),
      ...itemState(worstItem),
      connective(", well before "),
      data(weakest.shortLabel, "/runway"),
      connective(", your weakest team, at "),
      data(monthsPhrase(weakest.months!)),
      connective("."),
    ];
    return {
      status: itemStatus,
      statusLabel: STATUS_LABEL[itemStatus],
      finding: { segments },
      action: actionFor(itemStatus, 1),
      weakestTeamKey: weakest.key,
      missing: null,
    };
  }

  const status = teamStatus;

  /**
   * One team means the roll-up *is* that team, so naming both would print the
   * same figure twice in one sentence. The position carries the number; the
   * team clause only has to say who it belongs to.
   */
  if (ranked.length === 1) {
    return {
      status,
      statusLabel: STATUS_LABEL[status],
      finding: {
        segments: [
          ...positionClause(overallRunwayMonths),
          connective(", and "),
          data(weakest.shortLabel, "/runway"),
          connective(" is the only team drawing payroll."),
        ],
      },
      action: actionFor(status, 1),
      weakestTeamKey: weakest.key,
      missing: null,
    };
  }

  if (status === "stable") {
    // Every team clears the caution line — say so about all of them rather
    // than singling one out, since none is a problem.
    return {
      status,
      statusLabel: STATUS_LABEL[status],
      finding: {
        segments: [
          ...positionClause(overallRunwayMonths),
          connective(", and every team holds more than "),
          data(`${CAUTION_MONTHS} months`),
          connective(" of payroll runway; "),
          data(weakest.shortLabel, "/runway"),
          connective(" is the shortest at "),
          data(monthsPhrase(weakest.months!)),
          connective("."),
        ],
      },
      action: actionFor(status, 0),
      weakestTeamKey: weakest.key,
      missing: null,
    };
  }

  // Name every team under the caution line rather than counting them, up to a
  // second one; past that the queue below carries the full list.
  const alsoShort = ranked.slice(1).filter((r) => r.months! < CAUTION_MONTHS);
  const segments: VerdictSegment[] = [
    ...positionClause(overallRunwayMonths),
    connective(", but "),
    ...teamState(weakest),
  ];

  if (alsoShort.length === 0) {
    segments.push(
      connective(`, while every other team stays above ${CAUTION_MONTHS} months.`)
    );
  } else if (alsoShort.length === 1) {
    segments.push(
      connective(", and "),
      ...teamState(alsoShort[0]!, { trailing: false }),
      connective(".")
    );
  } else {
    segments.push(
      connective(", and so do "),
      data(alsoShort.map((r) => r.shortLabel).join(", ")),
      connective(".")
    );
  }

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    finding: { segments },
    action: actionFor(status, 1 + alsoShort.length),
    weakestTeamKey: weakest.key,
    missing: null,
  };
}

/** Flattened sentence, for aria-labels and tests. */
export function verdictText(verdict: Verdict): string {
  const finding = verdict.finding.segments.map((s) => s.text).join("");
  return [`${verdict.statusLabel}:`, finding, verdict.action ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
