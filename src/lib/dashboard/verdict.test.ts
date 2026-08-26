import { describe, expect, it } from "vitest";
import { buildVerdict, monthsPhrase, verdictText } from "@/lib/dashboard/verdict";
import { ALL_TEAMS_KEY, type TeamRunwayRow } from "@/lib/dashboard/teamRunway";

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

const base = {
  overallRunwayMonths: 14.9,
  worstItem: null,
  hasFunds: true,
  hasBurn: true,
};

describe("buildVerdict", () => {
  it("states the position before the team that threatens it", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Community management", 1.5), team("Data management", 20.2), rollup(14.9)],
    });
    expect(verdict.status).toBe("critical");
    expect(verdict.weakestTeamKey).toBe("community-management");
    expect(verdictText(verdict)).toBe(
      "Critical: Payroll is funded about 14.9 months out, but Community management averages 1.5 months of payroll runway, while every other team stays above 6 months. Move money onto it or cut its burn now."
    );
  });

  it("uses the at-risk status between the critical and caution lines", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Marketing", 3.2), team("Research development", 21.8), rollup(14.9)],
    });
    expect(verdict.status).toBe("at_risk");
    expect(verdictText(verdict)).toBe(
      "At Risk: Payroll is funded about 14.9 months out, but Marketing averages 3.2 months of payroll runway, while every other team stays above 6 months. Line up funding or trim burn this quarter, before it turns critical."
    );
  });

  it("confirms stability across every team, still naming the shortest", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Data management", 20.2), team("Community management", 8.4), rollup(14.9)],
    });
    expect(verdict.status).toBe("stable");
    expect(verdictText(verdict)).toBe(
      "Stable: Payroll is funded about 14.9 months out, and every team holds more than 6 months of payroll runway; Community management is the shortest, averaging 8.4 months. No funding action needed right now."
    );
  });

  it("names a second short team rather than counting it", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Alpha", 1.2), team("Beta", 4.0), team("Gamma", 30), rollup(9)],
    });
    expect(verdictText(verdict)).toBe(
      "Critical: Payroll is funded about 14.9 months out, but Alpha averages 1.2 months of payroll runway, and Beta averages 4.0 months. Move money onto them or cut their burn now."
    );
  });

  it("lists three or more short teams by name", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Alpha", 1.2), team("Beta", 2), team("Gamma", 4), team("Delta", 5), rollup(3)],
    });
    expect(verdictText(verdict)).toContain("and so do Beta, Gamma, Delta");
  });

  it("does not compare a present overdraft to a future duration", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Communities", 11.3), team("Data", 20.2), rollup(14.9)],
      worstItem: { label: "Community Manager · 7032261", months: -0.5 },
    });
    expect(verdictText(verdict)).toContain(
      "Community Manager · 7032261 is already overdrawn — Communities, your weakest team,"
    );
    expect(verdictText(verdict)).not.toContain("overdrawn, well before");
  });

  it("keeps \"well before\" where both sides are durations", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Communities", 11.3), team("Data", 20.2), rollup(14.9)],
      worstItem: { label: "Fund 4000", months: 0.2 },
    });
    expect(verdictText(verdict)).toContain("runs dry in less than a month, well before Communities");
  });

  it("states a team is overdrawn rather than reporting negative months", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Alpha", -2.4), team("Beta", 30), rollup(5)],
    });
    expect(verdict.status).toBe("critical");
    expect(verdictText(verdict)).toContain("Alpha is already overdrawn");
    expect(verdictText(verdict)).not.toContain("-2.4");
  });

  it("falls back to the roll-up when no team has been set up", () => {
    const verdict = buildVerdict({ ...base, teamRows: [rollup(14.9)] });
    expect(verdict.status).toBe("stable");
    expect(verdict.weakestTeamKey).toBeNull();
    expect(verdictText(verdict)).toBe(
      "Stable: Payroll is funded about 14.9 months out. No funding action needed right now."
    );
  });

  it("does not claim other teams are fine when there is only one", () => {
    const verdict = buildVerdict({ ...base, teamRows: [team("Alpha", 2), rollup(2)] });
    expect(verdictText(verdict)).toContain("Alpha is the only team drawing payroll");
    expect(verdictText(verdict)).not.toContain("every other team");
  });

  it("never prints the same figure twice when one team is the whole roll-up", () => {
    const verdict = buildVerdict({
      ...base,
      overallRunwayMonths: 2,
      teamRows: [team("Alpha", 2), rollup(2)],
    });
    expect(verdictText(verdict)).toBe(
      "Critical: Payroll is funded about 2.0 months out, and Alpha is the only team drawing payroll. Move money onto it or cut its burn now."
    );
  });

  it("ignores teams with no burn to rank on", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Ghost", null), team("Alpha", 9), rollup(9)],
    });
    expect(verdict.status).toBe("stable");
    expect(verdictText(verdict)).not.toContain("Ghost");
  });

  it("never declares safety while a single account is nearly dry", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [team("Community management", 13.1), team("Data management", 20.2), rollup(14.9)],
      worstItem: { label: "Fund 4000 · 138919A", months: 0.2 },
    });
    expect(verdict.status).toBe("critical");
    expect(verdictText(verdict)).toBe(
      "Critical: Payroll is funded about 14.9 months out, but Fund 4000 · 138919A runs dry in less than a month, well before Community management, your weakest team, averages 13.1 months. Move money onto it or cut its burn now."
    );
  });

  it("keeps the team framing when no individual item is worse", () => {
    const verdict = buildVerdict({
      ...base,
      overallRunwayMonths: 9,
      teamRows: [team("Alpha", 2), team("Beta", 30), rollup(9)],
      worstItem: { label: "Someone", months: 4 },
    });
    expect(verdict.status).toBe("critical");
    expect(verdictText(verdict)).toContain("Payroll is funded about 9.0 months out, but Alpha averages 2.0 months");
    expect(verdictText(verdict)).not.toContain("Someone");
  });

  it("floors the roll-up path on the worst item too", () => {
    const verdict = buildVerdict({
      ...base,
      teamRows: [rollup(14.9)],
      worstItem: { label: "Fund 4000", months: -1 },
    });
    expect(verdict.status).toBe("critical");
    expect(verdictText(verdict)).toBe(
      "Critical: Payroll is funded about 14.9 months out, but Fund 4000 is already overdrawn. Move money onto it or cut its burn now."
    );
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
