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
 * States whether money or a burn cut is needed — the two levers a PI actually
 * has. Deliberately does not prescribe which: Runway cannot know whether a
 * transfer, a re-budget, or an effort change is the right remedy, and
 * inventing one would be advice the data doesn't support.
 *
 * Declarative, never imperative. "Move money onto it" sat directly above a
 * sidebar reading "Planning estimates only. Confirm with your finance
 * post-award analyst" — the page cannot both instruct and disclaim. The
 * stable line reports the measurement rather than asserting that nothing
 * needs doing, which is a judgement the data cannot support either.
 */
function actionFor(
  status: Exclude<VerdictStatus, "insufficient_data">,
  shortTeamCount: number,
  hasTeams: boolean
): string {
  const plural = shortTeamCount > 1;
  switch (status) {
    case "critical":
      return plural
        ? "They need funding or a burn cut now."
        : "Needs funding or a burn cut now.";
    case "at_risk":
      return plural
        ? `They need funding or a burn cut this quarter, before they turn critical.`
        : `Needs funding or a burn cut this quarter, before it turns critical.`;
    case "stable":
      return hasTeams
        ? `No team is below the ${CAUTION_MONTHS}-month line.`
        : `Payroll runway is above the ${CAUTION_MONTHS}-month line.`;
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
 * Where the program stands, before anything that threatens it.
 *
 * The adjective reads the *roll-up's* own severity, not the verdict's. Those
 * differ on purpose: the portfolio can be broadly healthy while three
 * individual accounts are critical, and that gap is the single most useful
 * thing this sentence says. An adjective driven by the chip would flatten it
 * into "Payroll is short … but 3 are critical", which says one thing twice.
 */
function positionClause(
  months: number,
  rollupStatus: Exclude<VerdictStatus, "insufficient_data">
): VerdictSegment[] {
  if (months < 0) {
    return [connective("Your payroll accounts are "), data("already overdrawn")];
  }
  const lead =
    rollupStatus === "stable"
      ? "Payroll is broadly healthy, funded about "
      : rollupStatus === "at_risk"
        ? "Payroll is tight, funded about "
        : "Payroll is short, funded only about ";
  return [connective(lead), data(monthsPhrase(months)), connective(" out")];
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
/**
 * How much needs attention, and of what kind.
 *
 * Reports the governing severity only — critical when anything is critical,
 * else caution — because a hero that lists both counts stops being a
 * ten-second read. Data-quality rows are excluded on the same grounds
 * `pickWorstItem` excludes them: an uncategorized charge is not a funding
 * problem.
 */
export interface AttentionTally {
  severity: "critical" | "caution" | null;
  people: number;
  accounts: number;
  total: number;
}

export function tallyAttention(queue: AttentionQueue): AttentionTally {
  const funding = queue.rows.filter((r) => r.severity !== "data");
  const critical = funding.filter((r) => r.severity === "critical");
  const governing = critical.length > 0 ? critical : funding;
  if (governing.length === 0) return { severity: null, people: 0, accounts: 0, total: 0 };
  return {
    severity: critical.length > 0 ? "critical" : "caution",
    people: governing.filter((r) => r.kind === "person").length,
    accounts: governing.filter((r) => r.kind === "account").length,
    total: governing.length,
  };
}

/** "2 people and 1 account" — every count that reaches here is at least one. */
function tallyPhrase(tally: AttentionTally): string {
  const people = tally.people === 1 ? "1 person" : `${tally.people} people`;
  const accounts = tally.accounts === 1 ? "1 account" : `${tally.accounts} accounts`;
  if (tally.people > 0 && tally.accounts > 0) return `${people} and ${accounts}`;
  if (tally.people > 0) return people;
  if (tally.accounts > 0) return accounts;
  // Neither kind counted but rows exist: never expected, and still has to read.
  return tally.total === 1 ? "1 item" : `${tally.total} items`;
}

export function pickWorstItem(queue: AttentionQueue): WorstItem | null {
  const row = queue.rows.find((r) => r.severity !== "data");
  return row ? { label: row.entity, months: row.months } : null;
}

export function buildVerdict({
  teamRows,
  overallRunwayMonths,
  worstItem,
  tally,
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
  /** How much needs attention, from tallyAttention over the same queue. */
  tally: AttentionTally;
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
  const weakest = ranked[0] ?? null;

  const rollupStatus = statusFor(overallRunwayMonths);
  const teamStatus = weakest ? statusFor(weakest.months!) : "stable";
  const itemStatus = worstItem ? statusFor(worstItem.months) : "stable";

  /**
   * The chip carries the worst of the three. Averages hide sharper facts in
   * both directions — a team reads healthy while one of its accounts is nearly
   * dry, and the roll-up reads healthy while a whole team is not — so the
   * status is never allowed to be softer than anything beneath it.
   */
  const status = ([rollupStatus, teamStatus, itemStatus] as const).reduce((worst, next) =>
    SEVERITY_RANK[next] > SEVERITY_RANK[worst] ? next : worst
  );

  /**
   * Position first, then how much threatens it.
   *
   * The sentence used to name the single worst item and compare it to the
   * weakest team. That answered "what is wrong" without ever answering "how am
   * I doing", and naming one of several problems read as arbitrary.
   *
   * A count carries the scale, and the attention queue sits directly beneath
   * naming every one of them. That is what keeps this inside the count/name
   * rule rather than in breach of it: the rule exists to stop a count standing
   * where a name is unavailable, and here every name is one line below.
   */
  const segments: VerdictSegment[] = [...positionClause(overallRunwayMonths, rollupStatus)];

  if (tally.severity === null) {
    segments.push(connective("."));
  } else {
    const one = tally.total === 1;
    segments.push(
      connective(", but "),
      data(tallyPhrase(tally)),
      connective(
        tally.severity === "critical"
          ? one
            ? " is already critical"
            : " are already critical"
          : one
            ? ` needs attention within ${CAUTION_MONTHS} months`
            : ` need attention within ${CAUTION_MONTHS} months`
      )
    );
    segments.push(connective("."));
  }

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    finding: { segments },
    action: actionFor(status, tally.total, ranked.length > 0),
    weakestTeamKey: weakest?.key ?? null,
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
