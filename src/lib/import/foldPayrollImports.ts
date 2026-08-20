import type { PayrollReportImport, PayrollReportSnapshot } from "@/types";
import { mergePayrollSnapshots } from "@/lib/import/mergeSnapshots";
import { generateId } from "@/lib/utils/parse";

/** Fold payroll imports in upload order; later files override overlapping months. */
export function foldPayrollImports(
  imports: PayrollReportImport[]
): PayrollReportSnapshot | null {
  if (imports.length === 0) return null;
  let merged: PayrollReportSnapshot | null = null;
  for (const imp of imports) {
    merged = mergePayrollSnapshots(merged, imp.snapshot).snapshot;
  }
  return merged;
}

export function payrollImportFromSnapshot(
  snapshot: PayrollReportSnapshot
): PayrollReportImport {
  return {
    id: generateId(),
    sourceFileName: snapshot.sourceFileName ?? "payroll.xlsx",
    uploadedAt: snapshot.uploadedAt ?? new Date().toISOString(),
    monthRange: snapshot.monthRange ?? { start: "", end: "" },
    employeeCount: snapshot.employees?.length ?? 0,
    fundingSourceCount: snapshot.fundingSources?.length ?? 0,
    parseStatus: snapshot.parseStatus ?? "success",
    snapshot,
  };
}

/** Ensure legacy single-snapshot state has a matching imports list. */
export function ensurePayrollImports(
  snapshot: PayrollReportSnapshot | null,
  imports: PayrollReportImport[] | undefined
): PayrollReportImport[] {
  if (imports && imports.length > 0) return imports;
  if (!snapshot || snapshot.parseStatus === "failed") return [];
  return [payrollImportFromSnapshot(snapshot)];
}
