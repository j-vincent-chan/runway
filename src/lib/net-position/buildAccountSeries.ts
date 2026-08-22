import type { NetPositionAccountRow, NetPositionReportImport } from "@/types";

export interface NetPositionPoint {
  importId: string;
  reportRunDate: string;
  periodStart?: string;
  periodEnd?: string;
  /** Sort / display key: period end, else report run date */
  periodKey: string;
  sourceFileName: string;
  beginningBalance: number;
  revenues: number;
  expenses: number;
  otherChanges: number;
  netChange: number;
  endingBalance: number;
}

export interface NetPositionAccountSeries {
  accountKey: string;
  busUnit: string;
  fund: string;
  fundDescription?: string;
  dept: string;
  deptDescription?: string;
  project: string;
  projectDescription?: string;
  parentAwardId?: string;
  parentAwardDescription?: string;
  points: NetPositionPoint[];
  latest: NetPositionPoint;
  /** Latest ending − prior ending when ≥2 points */
  changeFromPrior: number | null;
}

function periodKeyForImport(imp: NetPositionReportImport): string {
  return imp.periodEnd ?? imp.reportRunDate;
}

function compareImports(a: NetPositionReportImport, b: NetPositionReportImport): number {
  const byPeriod = periodKeyForImport(a).localeCompare(periodKeyForImport(b));
  if (byPeriod !== 0) return byPeriod;
  const byRun = a.reportRunDate.localeCompare(b.reportRunDate);
  if (byRun !== 0) return byRun;
  return a.uploadedAt.localeCompare(b.uploadedAt);
}

function pointFrom(
  imp: NetPositionReportImport,
  row: NetPositionAccountRow
): NetPositionPoint {
  return {
    importId: imp.id,
    reportRunDate: imp.reportRunDate,
    periodStart: imp.periodStart,
    periodEnd: imp.periodEnd,
    periodKey: periodKeyForImport(imp),
    sourceFileName: imp.sourceFileName,
    beginningBalance: row.beginningBalance,
    revenues: row.revenues,
    expenses: row.expenses,
    otherChanges: row.otherChanges,
    netChange: row.netChange,
    endingBalance: row.endingBalance,
  };
}

/**
 * Collapse Net Position imports into per-account time series.
 * Same account + same period key: keep the later report run / upload.
 */
export function buildNetPositionAccountSeries(
  imports: NetPositionReportImport[]
): NetPositionAccountSeries[] {
  const byAccount = new Map<
    string,
    { meta: NetPositionAccountRow; byPeriod: Map<string, NetPositionPoint> }
  >();

  const sorted = [...imports].sort(compareImports);

  for (const imp of sorted) {
    for (const row of imp.rows) {
      let entry = byAccount.get(row.accountKey);
      if (!entry) {
        entry = { meta: row, byPeriod: new Map() };
        byAccount.set(row.accountKey, entry);
      } else {
        entry.meta = row;
      }
      const point = pointFrom(imp, row);
      entry.byPeriod.set(point.periodKey, point);
    }
  }

  const series: NetPositionAccountSeries[] = [];
  for (const [accountKey, { meta, byPeriod }] of byAccount) {
    const points = [...byPeriod.values()].sort((a, b) => {
      const byKey = a.periodKey.localeCompare(b.periodKey);
      if (byKey !== 0) return byKey;
      return a.reportRunDate.localeCompare(b.reportRunDate);
    });
    if (points.length === 0) continue;
    const latest = points[points.length - 1]!;
    const prior = points.length >= 2 ? points[points.length - 2]! : null;
    series.push({
      accountKey,
      busUnit: meta.busUnit,
      fund: meta.fund,
      fundDescription: meta.fundDescription,
      dept: meta.dept,
      deptDescription: meta.deptDescription,
      project: meta.project,
      projectDescription: meta.projectDescription,
      parentAwardId: meta.parentAwardId,
      parentAwardDescription: meta.parentAwardDescription,
      points,
      latest,
      changeFromPrior: prior ? latest.endingBalance - prior.endingBalance : null,
    });
  }

  return series.sort((a, b) => b.latest.endingBalance - a.latest.endingBalance);
}

export function netPositionPeriodLabel(point: {
  periodStart?: string;
  periodEnd?: string;
  reportRunDate: string;
}): string {
  if (point.periodStart && point.periodEnd) {
    if (point.periodStart === point.periodEnd) return point.periodEnd;
    return `${point.periodStart} → ${point.periodEnd}`;
  }
  if (point.periodEnd) return point.periodEnd;
  return point.reportRunDate;
}
