import type { Employee, PayrollReportSnapshot, PositionSalaryReportImport } from "@/types";
import { namesLooselyMatch, normalizePersonName } from "@/lib/employees/stableKey";
import { payFrequencyFromCompFreq } from "@/lib/parsers/positionSalaryParser";

export function latestPositionSalaryImport(
  imports: PositionSalaryReportImport[]
): PositionSalaryReportImport | undefined {
  if (imports.length === 0) return undefined;
  return [...imports].sort((a, b) => {
    const fy = (b.fiscalYear ?? "").localeCompare(a.fiscalYear ?? "");
    if (fy !== 0) return fy;
    const run = (b.reportRunDate ?? "").localeCompare(a.reportRunDate ?? "");
    if (run !== 0) return run;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  })[0];
}

function matchPerson(
  emp: Employee,
  people: PositionSalaryReportImport["people"]
): PositionSalaryReportImport["people"][number] | undefined {
  const hr = emp.employeeId?.trim();
  if (hr) {
    const byId = people.find((p) => p.ucsfEmplId === hr || p.ucpathEmplId === hr);
    if (byId) return byId;
  }
  const exact = people.find(
    (p) => normalizePersonName(p.name) === normalizePersonName(emp.name)
  );
  if (exact) return exact;
  return people.find((p) => namesLooselyMatch(p.name, emp.name));
}

/** Stamp official FY salary rates onto payroll employees. Does not change monthly charges. */
export function applyPositionSalaryToEmployees(
  employees: Employee[],
  imports: PositionSalaryReportImport[]
): Employee[] {
  const latest = latestPositionSalaryImport(imports);
  if (!latest || latest.people.length === 0) return employees;

  return employees.map((emp) => {
    const person = matchPerson(emp, latest.people);
    if (!person) return emp;

    const payFrequency = emp.payFrequency ?? (person.compFreq ? payFrequencyFromCompFreq(person.compFreq) : undefined);
    return {
      ...emp,
      employeeId: emp.employeeId || person.ucsfEmplId || emp.employeeId,
      annualSalary: person.totalSalary > 0 ? person.totalSalary : emp.annualSalary,
      role: emp.role || person.role,
      compensationType: emp.compensationType || person.compFreq,
      payFrequency,
    };
  });
}

export function overlayPositionSalaryOnSnapshot(
  snapshot: PayrollReportSnapshot | null,
  imports: PositionSalaryReportImport[]
): PayrollReportSnapshot | null {
  if (!snapshot) return null;
  if (imports.length === 0) return snapshot;
  return {
    ...snapshot,
    employees: applyPositionSalaryToEmployees(snapshot.employees, imports),
  };
}
