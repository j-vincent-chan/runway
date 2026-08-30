import { describe, expect, it } from "vitest";
import {
  buildVerdict,
  monthsPhrase,
  tallyAttention,
  verdictText,
  type AttentionTally,
} from "@/lib/dashboard/verdict";
import { ALL_TEAMS_KEY, type TeamRunwayRow } from "@/lib/dashboard/teamRunway";
import type { AttentionQueue, AttentionRow } from "@/lib/dashboard/attention";

function team(label: string, months: number | null): TeamRunwayRow {
  return {
    key: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    shortLabel: label,
    memberCount: 3,
    funds: 100_000,
    monthlyBurn: months && months > 0 ? 100_000 / months : 10_000,
    months,
    targetMonth: null,
    firstShort: null,
    hasEstimatedFunds: false,
  };
}

function rollup(months: number | null): TeamRunwayRow {
  return { ...team("All teams", months), key: ALL_TEAMS_KEY };
}

const quiet: AttentionTally = { severity: null, people: 0, accounts: 0, total: 0 };

function tally(
  severity: "critical" | "caution",
  people: number,
  accounts: number
): AttentionTally {
  return { severity, people, accounts, total: people + accounts };
}

const base = {
  overallRunwayMonths: 14.9,
  worstItem: null,
  tally: quiet,
  hasFunds: true,
  hasBurn: true,
};

describe("buildVerdict", () => {
  it("counts what needs attention rather than naming one of several", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Community management", 1.5), team("Data management", 20.2), rollup(14.9)],
      worstItem: { label: "Community Manager · 7032261", months: -0.5 },
      tally: tally("critical", 2, 1),
    });
    expect(verdict.status).toBe("critical");
    expect(verdictText(verdict)).toBe(
      "Critical: Payroll is broadly healthy, funded about 14.9 months out, but 2 people and 1 account are critical. They need funding or a burn cut now."
    );
  });

  it("describes the portfolio on its own terms, not the chip's", () => {
    // The roll-up is healthy and three things are critical. Both are true, and
    // the gap between them is the point of the sentence.
    const verdict = buildVerdict({
      ...base,
      teamRows: [rollup(14.9)],
      worstItem: { label: "Fund 4000", months: 0.2 },
      tally: tally("critical", 0, 3),
    });
    expect(verdict.status).toBe("critical");
    expect(verdictText(verdict)).toContain("Payroll is broadly healthy");
    expect(verdictText(verdict)).toContain("3 accounts are critical");
    // The attention queue below names all three; the hero states the scale.
    expect(verdictText(verdict)).not.toContain("Fund 4000");
  });

  it("says the portfolio is short when the roll-up itself is", () => {
    const verdict = buildVerdict({
      ...base,
      overallRunwayMonths: 2.1,
      teamRows: [rollup(2.1)],
      tally: tally("critical", 1, 0),
      worstItem: { label: "Alex Chen", months: 2.1 },
    });
    expect(verdictText(verdict)).toContain("Payroll is short, funded only about 2.1 months out");
    expect(verdictText(verdict)).toContain("1 person is critical");
  });

  it("uses the caution wording when nothing is critical yet", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Marketing", 4.2), rollup(14.9)],
      worstItem: { label: "Marketing lead", months: 4.2 },
      tally: tally("caution", 1, 1),
    });
    expect(verdict.status).toBe("at_risk");
    expect(verdictText(verdict)).toContain(
      "1 person and 1 account need attention within 6 months"
    );
  });

  it("states the position alone when nothing needs attention", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Data management", 20.2), rollup(14.9)],
    });
    expect(verdict.status).toBe("stable");
    expect(verdictText(verdict)).toBe(
      "Stable: Payroll is broadly healthy, funded about 14.9 months out. No team is below the 6-month line."
    );
  });

  it("states an overdrawn portfolio rather than a negative duration", () => {
    const verdict = buildVerdict({
      ...base,
      overallRunwayMonths: -3,
      teamRows: [rollup(-3)],
      worstItem: { label: "Fund 4000", months: -3 },
      tally: tally("critical", 0, 1),
    });
    expect(verdictText(verdict)).toContain("Your payroll accounts are already overdrawn");
    expect(verdictText(verdict)).not.toContain("-3");
  });

  it("never reads softer than the worst thing beneath it", () => {
    // Roll-up and every team look fine; one account does not.
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Alpha", 20), team("Beta", 30), rollup(25)],
      worstItem: { label: "Fund 4000", months: 0.2 },
      tally: tally("critical", 0, 1),
    });
    expect(verdict.status).toBe("critical");
  });

  it("escalates on the weakest team even when no queue row is worse", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Alpha", 2), team("Beta", 30), rollup(25)],
    });
    expect(verdict.status).toBe("critical");
  });

  it("never instructs the reader to move money", () => {
    for (const t of [quiet, tally("critical", 2, 1), tally("caution", 1, 0)]) {
      const text = verdictText(
        buildVerdict({ ...base, teamRows: [team("Alpha", 4), rollup(9)], tally: t })
      );
      expect(text).not.toMatch(/\bMove money\b/);
      expect(text).not.toMatch(/\bLine up\b/);
      expect(text).not.toMatch(/\btrim burn\b/);
    }
  });

  it("names what is missing instead of fabricating a status", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [],
      hasFunds: false,
      overallRunwayMonths: null,
    });
    expect(verdict.status).toBe("insufficient_data");
    expect(verdict.action).toBeNull();
    expect(verdict.missing?.href).toBe("/upload");
    expect(verdict.missing?.message).toContain("No account balances");
  });

  it("falls back to insufficient data when there is no burn rate", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [],
      hasBurn: false,
      overallRunwayMonths: null,
    });
    expect(verdict.status).toBe("insufficient_data");
    expect(verdict.missing?.message).toContain("no burn rate");
  });
});

describe("tallyAttention", () => {
  function row(
    id: string,
    severity: AttentionRow["severity"],
    kind: AttentionRow["kind"]
  ): AttentionRow {
    return {
      id,
      kind,
      severity,
      severityLabel: severity,
      entity: id,
      detail: "",
      href: "/runway",
      actionLabel: "View",
      months: 1,
    };
  }
  const queue = (rows: AttentionRow[]): AttentionQueue => ({
    rows,
    totalCount: rows.length,
    peopleAtRisk: [],
    accountsAtRisk: [],
    overdrawnAccounts: [],
  });

  it("counts only the critical rows once anything is critical", () => {
    const t = tallyAttention(
      queue([
        row("a", "critical", "person"),
        row("b", "critical", "account"),
        row("c", "caution", "person"),
      ])
    );
    expect(t).toEqual({ severity: "critical", people: 1, accounts: 1, total: 2 });
  });

  it("falls back to caution rows when nothing is critical", () => {
    const t = tallyAttention(queue([row("a", "caution", "person"), row("b", "caution", "person")]));
    expect(t).toEqual({ severity: "caution", people: 2, accounts: 0, total: 2 });
  });

  it("ignores data-quality rows, which are not funding problems", () => {
    const t = tallyAttention(queue([row("a", "data", "data")]));
    expect(t.severity).toBeNull();
    expect(t.total).toBe(0);
  });

  it("is quiet on an empty queue", () => {
    expect(tallyAttention(queue([])).severity).toBeNull();
  });
});

describe("monthsPhrase", () => {
  it("avoids a bare '1.0 months'", () => {
    expect(monthsPhrase(1.02)).toBe("1 month");
  });

  it("does not render a fractional month as a decimal", () => {
    expect(monthsPhrase(0.4)).toBe("less than a month");
  });

  it("keeps one decimal place otherwise", () => {
    expect(monthsPhrase(3.24)).toBe("3.2 months");
  });
});
