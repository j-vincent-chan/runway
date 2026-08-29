import type {
  AppSettings,
  PayrollReportSnapshot,
  ProjectionRule,
  WorkingPlan,
} from "@/types";
import type { AccountBalance } from "@/lib/funding/accountBalances";
import { simulateProjections } from "@/lib/projections/simulate";
import { formatMonthLabel } from "@/lib/projections/horizon";

/**
 * A Lock In captures one person's requested distribution change as data that
 * feeds three surfaces identically: the Status page row, the analyst email,
 * and the rendered distribution image. The diff is computed by running the
 * canonical projection engine twice — once as the PI planned it, once with
 * this person's rules removed — never by re-deriving any distribution here.
 */
export type ChangeSummaryMonthCell = {
  month: string; // "YYYY-MM"
  beforePercent: number;
  afterPercent: number;
  beforeMonthlyBurn: number;
  afterMonthlyBurn: number;
};

export type ChangeSummaryLine = {
  chartstringKey: string;
  /** Alias-resolved at capture time — the analyst may lack the PI's aliases. */
  accountLabel: string;
  /** Only months where the requested distribution differs from today's plan. */
  months: ChangeSummaryMonthCell[];
};

export type ChangeRequestDetails = {
  version: 1;
  personKey: string;
  personName: string;
  capturedAt: string; // ISO
  /** The person's rule set at capture time — the change spec itself. */
  rules: ProjectionRule[];
  lines: ChangeSummaryLine[];
};

const PCT_EPSILON = 0.05;

export function buildChangeSummary(input: {
  snapshot: PayrollReportSnapshot;
  workingPlan: WorkingPlan | null;
  settings: AppSettings;
  balances: Map<string, AccountBalance>;
  employeeId: string;
  personKey: string;
  personName: string;
  aliasFor: (chartstringKey: string) => string;
  now?: Date;
}): ChangeRequestDetails {
  const { snapshot, workingPlan, settings, balances, employeeId, personKey, now } = input;

  const personRules = (settings.projectionRules ?? []).filter(
    (r) => r.personKey === personKey
  );
  const withoutPerson: AppSettings = {
    ...settings,
    projectionRules: (settings.projectionRules ?? []).filter(
      (r) => r.personKey !== personKey
    ),
  };

  const after = simulateProjections({ snapshot, workingPlan, settings, balances, now });
  const before = simulateProjections({
    snapshot,
    workingPlan,
    settings: withoutPerson,
    balances,
    now,
  });

  const effortAt = (
    result: ReturnType<typeof simulateProjections>,
    month: string,
    chartstringKey: string
  ): { percent: number; burn: number } => {
    const a = result.states
      .find((s) => s.month === month)
      ?.allocations.find(
        (x) => x.employeeId === employeeId && x.chartstringKey === chartstringKey
      );
    return { percent: a?.percentEffort ?? 0, burn: a?.monthlyBurn ?? 0 };
  };

  const keys = new Set<string>();
  for (const result of [before, after]) {
    for (const state of result.states) {
      for (const a of state.allocations) {
        if (a.employeeId === employeeId) keys.add(a.chartstringKey);
      }
    }
  }

  const lines: ChangeSummaryLine[] = [];
  for (const chartstringKey of [...keys].sort()) {
    const months: ChangeSummaryMonthCell[] = [];
    for (const month of after.months) {
      const b = effortAt(before, month, chartstringKey);
      const a = effortAt(after, month, chartstringKey);
      if (Math.abs(b.percent - a.percent) < PCT_EPSILON) continue;
      months.push({
        month,
        beforePercent: b.percent,
        afterPercent: a.percent,
        beforeMonthlyBurn: b.burn,
        afterMonthlyBurn: a.burn,
      });
    }
    if (months.length > 0) {
      lines.push({
        chartstringKey,
        accountLabel: input.aliasFor(chartstringKey),
        months,
      });
    }
  }

  return {
    version: 1,
    personKey,
    personName: input.personName,
    capturedAt: new Date().toISOString(),
    rules: personRules,
    lines,
  };
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}%`;
}

type Segment = { from: string; to: string; beforePercent: number; afterPercent: number };

/** Consecutive months with the same before→after collapse into one segment. */
function segmentsForLine(line: ChangeSummaryLine): Segment[] {
  const segments: Segment[] = [];
  for (const cell of line.months) {
    const last = segments[segments.length - 1];
    if (
      last &&
      Math.abs(last.beforePercent - cell.beforePercent) < PCT_EPSILON &&
      Math.abs(last.afterPercent - cell.afterPercent) < PCT_EPSILON &&
      isNextMonth(last.to, cell.month)
    ) {
      last.to = cell.month;
    } else {
      segments.push({
        from: cell.month,
        to: cell.month,
        beforePercent: cell.beforePercent,
        afterPercent: cell.afterPercent,
      });
    }
  }
  return segments;
}

function isNextMonth(prev: string, next: string): boolean {
  const [py, pm] = prev.split("-").map(Number);
  const [ny, nm] = next.split("-").map(Number);
  if (py === undefined || pm === undefined || ny === undefined || nm === undefined) return false;
  return ny * 12 + nm === py * 12 + pm + 1;
}

/**
 * One sentence per account, e.g.
 * "Grant A: 50% → 25% from Mar 2027 through Aug 2027, then 25% → 0% from Sep 2027".
 * Every branch handles a single month as "in <month>".
 */
export function changeSummarySentences(details: ChangeRequestDetails): string[] {
  return details.lines.map((line) => {
    const parts = segmentsForLine(line).map((seg, i) => {
      const change = `${formatPct(seg.beforePercent)} → ${formatPct(seg.afterPercent)}`;
      const span =
        seg.from === seg.to
          ? `in ${formatMonthLabel(seg.from)}`
          : `from ${formatMonthLabel(seg.from)} through ${formatMonthLabel(seg.to)}`;
      return i === 0 ? `${change} ${span}` : `then ${change} ${span}`;
    });
    return `${line.accountLabel}: ${parts.join(", ")}`;
  });
}
