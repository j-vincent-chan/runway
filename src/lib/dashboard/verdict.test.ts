import { describe, expect, it } from "vitest";
import { buildVerdict, verdictText } from "@/lib/dashboard/verdict";
import type { AccountAtRisk, PersonAtRisk } from "@/lib/dashboard/attention";

function person(name: string, months: number): PersonAtRisk {
  return { employeeId: name, name, months };
}

function account(name: string, months: number, balance: number): AccountAtRisk {
  return { chartRoot: name, name, months, balance };
}

const base = {
  planningMonth: "2026-08",
  horizonMonths: 12,
  runwayMonths: 9.8,
  hasFunds: true,
  hasBurn: true,
  peopleAtRisk: [] as PersonAtRisk[],
  accountsAtRisk: [] as AccountAtRisk[],
  overdrawnAccounts: [] as AccountAtRisk[],
};

describe("buildVerdict", () => {
  it("states a funded-through date and names the risk when people fall short", () => {
    const verdict = buildVerdict({
      ...base,
      peopleAtRisk: [person("M. Chen", 3), person("R. Okafor", 6)],
      accountsAtRisk: [account("5R01-118440", 4, 8110)],
    });
    expect(verdict.kind).toBe("at_risk");
    expect(verdictText(verdict)).toBe(
      "Funded through May 2027 at your current rate. 2 people and 1 account fall short before then."
    );
    expect(verdict.runwayMonth).toBe("2027-05");
  });

  it("confirms the healthy state with a positive second clause", () => {
    const verdict = buildVerdict(base);
    expect(verdict.kind).toBe("healthy");
    expect(verdictText(verdict)).toBe(
      "Funded through May 2027 at your current rate. No one runs short in that window."
    );
    expect(verdict.clauses[1]?.tone).toBe("healthy");
  });

  it("never extrapolates a date beyond the horizon", () => {
    const verdict = buildVerdict({ ...base, runwayMonths: 41 });
    expect(verdict.kind).toBe("beyond_horizon");
    expect(verdictText(verdict)).toContain("Funded past August 2027");
    expect(verdict.runwayMonth).toBeNull();
  });

  it("leads with an overdrawn account", () => {
    const verdict = buildVerdict({
      ...base,
      overdrawnAccounts: [account("5R01-118440", -1, -8110)],
    });
    expect(verdict.kind).toBe("overdrawn");
    expect(verdictText(verdict)).toBe(
      "5R01-118440 is overdrawn by $8,110. Funded through May 2027 at your current rate."
    );
  });

  it("summarizes multiple overdrawn accounts without inventing a list", () => {
    const verdict = buildVerdict({
      ...base,
      overdrawnAccounts: [account("A", -1, -900), account("B", -1, -200)],
    });
    expect(verdictText(verdict)).toContain("A and 1 other account are overdrawn.");
  });

  it("names what is missing instead of fabricating a date", () => {
    const verdict = buildVerdict({ ...base, hasFunds: false, runwayMonths: null });
    expect(verdict.kind).toBe("insufficient_data");
    expect(verdictText(verdict)).toBe("Not enough data to project runway.");
    expect(verdict.missing?.href).toBe("/upload");
    expect(verdict.runwayMonth).toBeNull();
  });

  it("falls back to insufficient data when there is no burn rate", () => {
    const verdict = buildVerdict({ ...base, hasBurn: false, runwayMonths: null });
    expect(verdict.kind).toBe("insufficient_data");
    expect(verdict.missing?.message).toContain("no burn rate");
  });

  describe("pluralization", () => {
    it("omits the zero side entirely", () => {
      const people = buildVerdict({ ...base, peopleAtRisk: [person("A", 2), person("B", 3)] });
      expect(verdictText(people)).toContain("2 people fall short before then.");
      expect(verdictText(people)).not.toContain("account");

      const accounts = buildVerdict({ ...base, accountsAtRisk: [account("A", 2, 10)] });
      expect(verdictText(accounts)).toContain("1 account falls short before then.");
      expect(verdictText(accounts)).not.toContain("people");
    });

    it("uses singular verb agreement for a single entity", () => {
      const one = buildVerdict({ ...base, peopleAtRisk: [person("A", 2)] });
      expect(verdictText(one)).toContain("1 person falls short before then.");
    });

    it("treats one of each as plural", () => {
      const mixed = buildVerdict({
        ...base,
        peopleAtRisk: [person("A", 2)],
        accountsAtRisk: [account("B", 2, 10)],
      });
      expect(verdictText(mixed)).toContain("1 person and 1 account fall short before then.");
    });
  });
});
