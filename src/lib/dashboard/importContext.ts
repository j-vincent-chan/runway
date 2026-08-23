import { resolvePeriodStatus } from "@/lib/dashboard/overview";
import { monthLabelLong } from "@/lib/dashboard/month";
import type { PayrollReportSnapshot } from "@/types";

export interface ImportContext {
  /** e.g. "August 2026 payroll" */
  periodLabel: string;
  closed: boolean;
  importedAtLabel: string;
  sourceFileName: string;
  /** null when Supabase isn't configured, so sync state isn't applicable */
  syncLabel: string | null;
}

/** Bundles filename, import timestamp, sync state, and period closure for the context bar. */
export function buildImportContext(
  snapshot: PayrollReportSnapshot,
  planningMonth: string,
  cloudConfigured: boolean,
  cloudSyncEnabled: boolean
): ImportContext {
  const status = resolvePeriodStatus(snapshot, planningMonth);
  return {
    periodLabel: `${monthLabelLong(status.month)} payroll`,
    closed: status.closed,
    importedAtLabel: new Date(snapshot.uploadedAt).toLocaleString(),
    sourceFileName: snapshot.sourceFileName,
    syncLabel: cloudConfigured ? (cloudSyncEnabled ? "Cloud sync on" : "Local only") : null,
  };
}
