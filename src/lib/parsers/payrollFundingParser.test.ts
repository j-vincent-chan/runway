import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parsePayrollFundingWorkbook } from "@/lib/parsers/payrollFundingParser";
import { namesLooselyMatch } from "@/lib/employees/stableKey";
import { mergePayrollSnapshots } from "@/lib/import/mergeSnapshots";

function workbook(rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Payroll Funding");
  return wb;
}

function report(peopleRows: unknown[][]) {
  return workbook([
    ["", "Actual", "", "Future"],
    ["Employee", "Compensation Type", "Jul-2025", "Aug-2025"],
    ...peopleRows,
  ]);
}

describe("payroll funding parser identity", () => {
  it("keeps Vincent Chan and Ohnmar Chan on different accounts", () => {
    const { snapshot } = parsePayrollFundingWorkbook(
      report([
        ["Chan, Vincent (025926122 / 11111111); 1 - PROFESSOR", "Base Salary", 10000, 10000],
        ["", "Percent of Effort (19900-44-VINCENT-45)", 50, 50],
        ["Chan, Ohnmar (099988877 / 22222222); 2 - ANALYST", "Base Salary", 8000, 8000],
        ["", "Percent of Effort (4000-44-OHNMAR-45)", 100, 100],
      ]),
      "pfr.xlsx"
    );

    const names = snapshot.employees.map((e) => e.name).sort();
    expect(names).toEqual(["Ohnmar Chan", "Vincent Chan"]);

    const vincent = snapshot.employees.find((e) => e.name === "Vincent Chan")!;
    const ohnmar = snapshot.employees.find((e) => e.name === "Ohnmar Chan")!;
    expect(vincent.employeeId).toBe("025926122");
    expect(ohnmar.employeeId).toBe("099988877");

    const vincentSources = new Set(
      snapshot.monthlyAllocations
        .filter((a) => a.employeeId === vincent.id)
        .map((a) => a.fundingSourceId)
    );
    const ohnmarSources = new Set(
      snapshot.monthlyAllocations
        .filter((a) => a.employeeId === ohnmar.id)
        .map((a) => a.fundingSourceId)
    );
    expect(vincentSources.size).toBe(1);
    expect(ohnmarSources.size).toBe(1);
    expect([...vincentSources][0]).not.toBe([...ohnmarSources][0]);
  });

  it("does not clone an employee when the name is fill-down onto funding rows", () => {
    const { snapshot } = parsePayrollFundingWorkbook(
      report([
        ["Chan, Vincent (025926122 / 111); 1 - PROFESSOR", "Base Salary", 10000, 10000],
        ["Chan, Vincent (025926122 / 111); 1 - PROFESSOR", "Percent of Effort (19900-44-A-45)", 40, 40],
        ["Chan, Vincent (025926122 / 111); 1 - PROFESSOR", "Percent of Effort (4000-44-B-45)", 60, 60],
      ]),
      "pfr.xlsx"
    );

    expect(snapshot.employees).toHaveLength(1);
    expect(snapshot.employees[0]?.name).toBe("Vincent Chan");
    const sourceIds = new Set(snapshot.monthlyAllocations.map((a) => a.fundingSourceId));
    expect(sourceIds.size).toBe(2);
  });

  it("starts a new person on Last, First + compensation even without an HR id in the cell", () => {
    const { snapshot } = parsePayrollFundingWorkbook(
      report([
        ["Chan, Vincent (025926122 / 111)", "Percent of Effort (19900-44-A-45)", 50, 50],
        ["Chan, Ohnmar", "Percent of Effort (4000-44-B-45)", 100, 100],
      ]),
      "pfr.xlsx"
    );

    expect(snapshot.employees.map((e) => e.name).sort()).toEqual(["Ohnmar Chan", "Vincent Chan"]);
  });

  it("does not attach a later unnamed block to the last person in the file", () => {
    const { snapshot } = parsePayrollFundingWorkbook(
      workbook([
        ["", "Actual"],
        ["Employee", "Compensation Type", "Jul-2025"],
        ["Chan, Vincent (025926122 / 111)", "Percent of Effort (19900-44-VINCENT-45)", 55.3],
        ["Chan, Ohnmar (029683794 / 222)", "Percent of Effort (5000-44-OHNMAR-45)", 100],
        ["Employee", "Compensation Type", "Aug-2025"],
        ["", "Percent of Effort (19900-44-VINCENT-45)", 55.3],
        ["", "Percent of Effort (5000-44-OHNMAR-45)", 100],
      ]),
      "pfr.xlsx"
    );

    expect(snapshot.employees).toHaveLength(2);
    const vincent = snapshot.employees.find((e) => e.name === "Vincent Chan")!;
    const ohnmar = snapshot.employees.find((e) => e.name === "Ohnmar Chan")!;
    const vAug = snapshot.monthlyAllocations.filter(
      (a) => a.employeeId === vincent.id && a.month === "2025-08"
    );
    const oAug = snapshot.monthlyAllocations.filter(
      (a) => a.employeeId === ohnmar.id && a.month === "2025-08"
    );
    expect(vAug).toHaveLength(1);
    expect(vAug[0]?.percentEffort).toBe(55.3);
    expect(oAug).toHaveLength(1);
    expect(oAug[0]?.percentEffort).toBe(100);
    expect(vAug[0]?.fundingSourceId).not.toBe(oAug[0]?.fundingSourceId);
  });

  it("reuses the same person when a second header block repeats the HR id", () => {
    const { snapshot } = parsePayrollFundingWorkbook(
      workbook([
        ["", "Actual"],
        ["Employee", "Compensation Type", "Jul-2025"],
        ["Chan, Vincent (025926122 / 111)", "Percent of Effort (19900-44-VINCENT-45)", 50],
        ["Chan, Ohnmar (029683794 / 222)", "Percent of Effort (5000-44-OHNMAR-45)", 100],
        ["Employee", "Compensation Type", "Aug-2025"],
        ["Chan, Vincent (025926122 / 111)", "Percent of Effort (19900-44-VINCENT-45)", 50],
        ["Chan, Ohnmar (029683794 / 222)", "Percent of Effort (5000-44-OHNMAR-45)", 100],
      ]),
      "pfr.xlsx"
    );

    expect(snapshot.employees).toHaveLength(2);
    const vincent = snapshot.employees.find((e) => e.name === "Vincent Chan")!;
    expect(
      snapshot.monthlyAllocations.filter((a) => a.employeeId === vincent.id).map((a) => a.month).sort()
    ).toEqual(["2025-07", "2025-08"]);
  });
});

describe("namesLooselyMatch", () => {
  it("does not treat two people with the same last name as the same person", () => {
    expect(namesLooselyMatch("Vincent Chan", "Ohnmar Chan")).toBe(false);
    expect(namesLooselyMatch("Chan, Vincent", "Chan, Ohnmar")).toBe(false);
  });
});

describe("mergePayrollSnapshots", () => {
  it("does not merge two Chans who have different HR ids", () => {
    const a = parsePayrollFundingWorkbook(
      report([["Chan, Vincent (025926122 / 111)", "Percent of Effort (19900-44-A-45)", 50, 50]]),
      "a.xlsx"
    ).snapshot;
    const b = parsePayrollFundingWorkbook(
      report([["Chan, Ohnmar (099988877 / 222)", "Percent of Effort (4000-44-B-45)", 100, 100]]),
      "b.xlsx"
    ).snapshot;

    const merged = mergePayrollSnapshots(a, b).snapshot;
    expect(merged.employees.map((e) => e.name).sort()).toEqual(["Ohnmar Chan", "Vincent Chan"]);
  });
});

describe("payroll reversals", () => {
  it("keeps negative percent-of-effort cells and nets them into the monthly total", () => {
    const { snapshot } = parsePayrollFundingWorkbook(
      workbook([
        ["", "Actual", "", ""],
        ["Employee", "Compensation Type", "Oct-2025", "Nov-2025"],
        ["Bolus, Reid (111222333 / 444)", "Base Salary", 12668, 12668],
        ["", "Percent of Effort (19900-44-146328D-45)", 25, 25],
        ["", "Percent of Effort (19900-44-OTHER-45)", 75, 100],
        ["", "Percent of Effort (4000-44-WRONG-45)", "", -0.25],
      ]),
      "pfr.xlsx"
    );

    const reid = snapshot.employees.find((e) => e.name === "Reid Bolus")!;
    expect(reid).toBeTruthy();

    const oct = snapshot.monthlyAllocations.filter(
      (a) => a.employeeId === reid.id && a.month === "2025-10"
    );
    const nov = snapshot.monthlyAllocations.filter(
      (a) => a.employeeId === reid.id && a.month === "2025-11"
    );

    expect(oct.reduce((s, a) => s + a.percentEffort, 0)).toBe(100);
    expect(nov.find((a) => a.percentEffort < 0)?.percentEffort).toBe(-25);
    expect(nov.reduce((s, a) => s + a.percentEffort, 0)).toBe(100);
  });

  it("scales Excel percent fractions over 100% instead of treating them as percent points", () => {
    const { snapshot } = parsePayrollFundingWorkbook(
      workbook([
        ["", "Actual", "", ""],
        ["Employee", "Compensation Type", "Dec-2025"],
        ["Bolus, Reid (111222333 / 444)", "Base Salary", 8428],
        ["", "Percent of Effort (19900-44-7031907-45)", 1.5],
        ["", "Percent of Effort (19900-44-7701956-45)", -1.25],
      ]),
      "pfr.xlsx"
    );

    const reid = snapshot.employees.find((e) => e.name === "Reid Bolus")!;
    const dec = snapshot.monthlyAllocations.filter(
      (a) => a.employeeId === reid.id && a.month === "2025-12"
    );
    const byProject = Object.fromEntries(
      dec.map((a) => {
        const src = snapshot.fundingSources.find((f) => f.id === a.fundingSourceId);
        return [src?.projectId ?? src?.accountString, a.percentEffort];
      })
    );

    expect(byProject["7031907"]).toBe(150);
    expect(byProject["7701956"]).toBe(-125);
  });
});

