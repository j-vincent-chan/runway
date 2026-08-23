import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseFiscalYearToken,
  parsePositionSalaryWorkbook,
  payFrequencyFromCompFreq,
} from "@/lib/parsers/positionSalaryParser";
import { applyPositionSalaryToEmployees } from "@/lib/employees/positionSalary";
import type { Employee } from "@/types";

function salaryWorkbook(opts?: { fiscalYear?: string; people?: unknown[][] }) {
  const wb = XLSX.utils.book_new();
  const params = [
    ["", "", "Employee and Position Salary Report"],
    [],
    [],
    [],
    [],
    ["HR Dept ID:", "All", "Fiscal Year:", opts?.fiscalYear ?? "2026-27;"],
    ["Position Dept ID:", "All", "Data Refresh Time:", new Date("2026-08-01")],
    ["Employee:", "All", "Report Run Date:", new Date("2026-08-15")],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(params), "Parameters");

  const header = [
    "Employee",
    "UCSF Empl ID",
    "UCPath Empl ID",
    "Position",
    "Reports To",
    "Job Code",
    "Job FTE",
    "HR Dept",
    "Position Dept",
    "Employee Status",
    "Employee Class",
    "Employee Class Indicator",
    "Salary Admin Plan",
    "Grade",
    "Rank",
    "Step",
    "Pay Group",
    "Comp Freq",
    "Job Effective Date",
    "Distribution Begin Date",
    "Base Salary (X)",
    "Negotiated Salary (Y)",
    "Other Compensation (Z)",
    "Total Salary",
  ];

  const people =
    opts?.people ??
    [
      ["Employee: Ada Lovelace (025111111/10111111)"],
      [
        "Ada Lovelace",
        "025111111",
        "10111111",
        "41100001 - ANALYST 3",
        "Grace Hopper",
        "005000 - ANALYST 3",
        1,
        "129074",
        "129074",
        "A - Active",
        "2 - Staff: Career",
        "1 - Professional & Support Staff",
        "UCRX",
        "",
        "",
        "",
        "2B7",
        "M - Monthly",
        new Date("2025-07-01"),
        new Date("2025-07-01"),
        90000,
        10000,
        0,
        100000,
      ],
      ["Total: Employee: Ada Lovelace (025111111/10111111)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", 90000, 10000, 0, 100000],
      ["Employee: Vic Chan (025926122/10351430)"],
      [
        "Vic Chan",
        "025926122",
        "10351430",
        "40635483 - ASSOC PROF",
        "",
        "001000 - ASSOC PROF",
        1,
        "129074",
        "129074",
        "A - Active",
        "9 - Academic: Faculty",
        "A - Academic",
        "T002",
        "",
        "",
        "",
        "2AC",
        "UC_FY - UC 12/12 - FY",
        new Date("2024-07-01"),
        new Date("2024-07-01"),
        120000,
        30000,
        5000,
        155000,
      ],
      [
        "Vic Chan",
        "025926122",
        "10351430",
        "40635483 - ASSOC PROF",
        "",
        "001000 - ASSOC PROF",
        0,
        "129074",
        "129074",
        "A - Active",
        "9 - Academic: Faculty",
        "A - Academic",
        "APU3",
        "",
        "",
        "",
        "2HS",
        "UC_FY - UC 12/12 - FY",
        new Date("2024-07-01"),
        new Date("2024-07-01"),
        0,
        20000,
        0,
        20000,
      ],
      ["Total: Employee: Vic Chan (025926122/10351430)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", 120000, 50000, 5000, 175000],
    ];

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([[], [], [], [], [], header, ...people]),
    "Employee and Position Salary"
  );
  return wb;
}

describe("parseFiscalYearToken", () => {
  it("strips trailing punctuation", () => {
    expect(parseFiscalYearToken("2026-27;")).toBe("2026-27");
  });
});

describe("payFrequencyFromCompFreq", () => {
  it("maps monthly and FY 12/12, ignores hourly", () => {
    expect(payFrequencyFromCompFreq("M - Monthly")).toBe("monthly");
    expect(payFrequencyFromCompFreq("UC_FY - UC 12/12 - FY")).toBe("monthly");
    expect(payFrequencyFromCompFreq("H - Hourly")).toBeUndefined();
  });
});

describe("parsePositionSalaryWorkbook", () => {
  it("parses FY totals, including multi-position employees", () => {
    const { import: imp, warnings } = parsePositionSalaryWorkbook(salaryWorkbook(), "salary.xlsx");
    expect(warnings.filter((w) => w.severity === "error")).toHaveLength(0);
    expect(imp.fiscalYear).toBe("2026-27");
    expect(imp.people).toHaveLength(2);

    const ada = imp.people.find((p) => p.ucsfEmplId === "025111111")!;
    expect(ada.name).toBe("Ada Lovelace");
    expect(ada.totalSalary).toBe(100000);
    expect(ada.baseSalaryX).toBe(90000);
    expect(ada.jobFte).toBe(1);
    expect(ada.role).toBe("ANALYST 3");

    const vic = imp.people.find((p) => p.ucsfEmplId === "025926122")!;
    expect(vic.positions).toHaveLength(2);
    expect(vic.totalSalary).toBe(175000);
    expect(vic.jobFte).toBe(1);
  });

  const sample = resolve(
    process.cwd(),
    "financial-reports/26-08 Employee and Position Salary Report-15750524.xlsx"
  );
  it.skipIf(!existsSync(sample))("parses the local FY salary report", () => {
    const wb = XLSX.read(readFileSync(sample), { type: "buffer", cellDates: true });
    const { import: imp, warnings } = parsePositionSalaryWorkbook(wb, "salary.xlsx");
    expect(warnings.filter((w) => w.severity === "error")).toHaveLength(0);
    expect(imp.fiscalYear).toBe("2026-27");
    expect(imp.people.length).toBeGreaterThan(5);
    expect(imp.people.every((p) => p.ucsfEmplId)).toBe(true);
    expect(imp.people.filter((p) => p.totalSalary > 0).length).toBeGreaterThan(5);
  });
});

describe("applyPositionSalaryToEmployees", () => {
  it("stamps FY total salary onto payroll employees matched by HR id", () => {
    const { import: imp } = parsePositionSalaryWorkbook(salaryWorkbook(), "salary.xlsx");
    const employees: Employee[] = [
      { id: "e1", name: "Ada Lovelace", appointmentPercent: 100, employeeId: "025111111" },
      { id: "e2", name: "Someone Else", appointmentPercent: 100 },
    ];
    const next = applyPositionSalaryToEmployees(employees, [imp]);
    expect(next[0]?.annualSalary).toBe(100000);
    expect(next[0]?.payFrequency).toBe("monthly");
    expect(next[1]?.annualSalary).toBeUndefined();
  });
});
