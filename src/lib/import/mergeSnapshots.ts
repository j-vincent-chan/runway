import type {
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayrollReportSnapshot,
} from "@/types";
import { generateId } from "@/lib/utils/parse";
import { consolidateAllocations } from "@/lib/import/consolidateAllocations";
import { normalizePersonName } from "@/lib/employees/stableKey";

function monthsInSnapshot(snap: PayrollReportSnapshot): Set<string> {
  const set = new Set<string>();
  snap.monthlyAllocations.forEach((a) => set.add(a.month));
  snap.monthlyCosts.forEach((c) => set.add(c.month));
  return set;
}

function mergeEmployees(
  existing: Employee[],
  incoming: Employee[]
): { employees: Employee[]; idMap: Map<string, string> } {
  const employees = existing.map((e) => ({ ...e }));
  const idMap = new Map<string, string>();

  for (const inc of incoming) {
    const match = employees.find((e) => {
      if (e.employeeId && inc.employeeId) return e.employeeId === inc.employeeId;
      return normalizePersonName(e.name) === normalizePersonName(inc.name);
    });
    if (match) {
      idMap.set(inc.id, match.id);
      if (inc.role && !match.role) match.role = inc.role;
      if (inc.appointmentPercent) match.appointmentPercent = inc.appointmentPercent;
    } else {
      employees.push({ ...inc, id: inc.id });
      idMap.set(inc.id, inc.id);
    }
  }
  return { employees, idMap };
}

function sourceKey(fs: FundingSource): string {
  return (fs.accountString ?? fs.rawName).trim().toLowerCase();
}

function mergeFundingSources(
  existing: FundingSource[],
  incoming: FundingSource[]
): { fundingSources: FundingSource[]; idMap: Map<string, string> } {
  const fundingSources = existing.map((f) => ({ ...f }));
  const idMap = new Map<string, string>();

  for (const inc of incoming) {
    const key = sourceKey(inc);
    const match = fundingSources.find((f) => sourceKey(f) === key);
    if (match) {
      idMap.set(inc.id, match.id);
    } else {
      fundingSources.push({ ...inc });
      idMap.set(inc.id, inc.id);
    }
  }
  return { fundingSources, idMap };
}

function remapAllocations(
  allocations: MonthlyAllocation[],
  employeeMap: Map<string, string>,
  sourceMap: Map<string, string>
): MonthlyAllocation[] {
  return allocations.map((a) => ({
    ...a,
    id: generateId(),
    employeeId: employeeMap.get(a.employeeId) ?? a.employeeId,
    fundingSourceId: sourceMap.get(a.fundingSourceId) ?? a.fundingSourceId,
    status: "imported" as const,
  }));
}

function remapCosts(
  costs: MonthlyCostRecord[],
  employeeMap: Map<string, string>,
  sourceMap: Map<string, string>
): MonthlyCostRecord[] {
  return costs.map((c) => ({
    ...c,
    id: generateId(),
    employeeId: employeeMap.get(c.employeeId) ?? c.employeeId,
    fundingSourceId: c.fundingSourceId
      ? sourceMap.get(c.fundingSourceId) ?? c.fundingSourceId
      : undefined,
  }));
}

function recomputeMonthRange(months: string[]): { start: string; end: string } {
  const sorted = [...months].sort();
  return { start: sorted[0] ?? "", end: sorted[sorted.length - 1] ?? "" };
}

function recomputeActualFutureMonths(
  existing: PayrollReportSnapshot,
  incoming: PayrollReportSnapshot,
  overwriteMonths: Set<string>,
  allMonths: string[]
): { actualMonths: string[]; futureMonths: string[] } {
  const actual = new Set<string>();
  const future = new Set<string>();

  for (const m of allMonths) {
    if (overwriteMonths.has(m)) {
      if (incoming.actualMonths.includes(m)) actual.add(m);
      if (incoming.futureMonths.includes(m)) future.add(m);
      if (!incoming.actualMonths.includes(m) && !incoming.futureMonths.includes(m)) {
        incoming.monthlyAllocations
          .filter((a) => a.month === m)
          .forEach((a) => {
            if (a.sourceType === "actual") actual.add(m);
            if (a.sourceType === "future") future.add(m);
          });
      }
    } else {
      if (existing.actualMonths.includes(m)) actual.add(m);
      if (existing.futureMonths.includes(m)) future.add(m);
    }
  }

  return {
    actualMonths: [...actual].sort(),
    futureMonths: [...future].sort(),
  };
}

export interface MergeResult {
  snapshot: PayrollReportSnapshot;
  overwrittenMonths: string[];
  preservedMonths: string[];
  isMerge: boolean;
}

export function mergePayrollSnapshots(
  existing: PayrollReportSnapshot | null,
  incoming: PayrollReportSnapshot
): MergeResult {
  if (!existing || existing.parseStatus === "failed") {
    return {
      snapshot: incoming,
      overwrittenMonths: [],
      preservedMonths: [],
      isMerge: false,
    };
  }

  const overwriteMonths = monthsInSnapshot(incoming);
  const existingMonths = monthsInSnapshot(existing);
  const preservedMonths = [...existingMonths].filter((m) => !overwriteMonths.has(m)).sort();
  const overwrittenMonths = [...overwriteMonths].sort();

  const { employees, idMap: employeeMap } = mergeEmployees(existing.employees, incoming.employees);
  const { fundingSources, idMap: sourceMap } = mergeFundingSources(
    existing.fundingSources,
    incoming.fundingSources
  );

  const incomingAllocations = remapAllocations(
    incoming.monthlyAllocations,
    employeeMap,
    sourceMap
  );
  const incomingCosts = remapCosts(incoming.monthlyCosts, employeeMap, sourceMap);

  const monthlyAllocations = consolidateAllocations([
    ...existing.monthlyAllocations.filter((a) => !overwriteMonths.has(a.month)),
    ...incomingAllocations,
  ]);

  const monthlyCosts = [
    ...existing.monthlyCosts.filter((c) => !overwriteMonths.has(c.month)),
    ...incomingCosts,
  ];

  const allMonths = [
    ...new Set([
      ...monthlyAllocations.map((a) => a.month),
      ...monthlyCosts.map((c) => c.month),
    ]),
  ].sort();

  const { actualMonths, futureMonths } = recomputeActualFutureMonths(
    existing,
    incoming,
    overwriteMonths,
    allMonths
  );

  const parseStatus =
    incoming.parseStatus === "failed"
      ? "failed"
      : existing.parseStatus === "partial" || incoming.parseStatus === "partial"
        ? "partial"
        : "success";

  const snapshot: PayrollReportSnapshot = {
    ...existing,
    id: existing.id,
    sourceFileName: incoming.sourceFileName,
    uploadedAt: new Date().toISOString(),
    reportDate: incoming.reportDate ?? existing.reportDate,
    sheetName: incoming.sheetName,
    parserVersion: incoming.parserVersion,
    parseStatus,
    parseWarnings: [
      ...existing.parseWarnings,
      {
        id: generateId(),
        severity: "info",
        message: `Merged import: replaced ${overwrittenMonths.length} month(s), preserved ${preservedMonths.length} month(s).`,
      },
      ...incoming.parseWarnings,
    ],
    employees,
    fundingSources,
    monthlyAllocations,
    monthlyCosts,
    rawRows: [...existing.rawRows, ...incoming.rawRows],
    monthRange: recomputeMonthRange(allMonths),
    actualMonths,
    futureMonths,
  };

  return {
    snapshot,
    overwrittenMonths,
    preservedMonths,
    isMerge: true,
  };
}

export function mergeWorkingPlanAllocations(
  existingPlan: MonthlyAllocation[] | undefined,
  mergedSnapshot: PayrollReportSnapshot,
  overwriteMonths: Set<string>
): MonthlyAllocation[] {
  const kept =
    existingPlan?.filter(
      (a) => !overwriteMonths.has(a.month) && a.status === "edited"
    ) ?? [];

  const importedForOverwriteMonths = mergedSnapshot.monthlyAllocations.filter((a) =>
    overwriteMonths.has(a.month)
  );

  return [...kept, ...importedForOverwriteMonths];
}
