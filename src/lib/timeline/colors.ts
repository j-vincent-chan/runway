import type { FundingSource, PayrollReportSnapshot } from "@/types";
import { paletteColorForVisibleIndex } from "@/lib/timeline/visibleBarColors";

/** Default palette on funding sources (global sort). Timeline bars use visible-row colors instead. */
export function refreshFundingSourceColors(
  snapshot: PayrollReportSnapshot
): PayrollReportSnapshot {
  const ordered = [...snapshot.fundingSources].sort((a, b) =>
    a.accountString?.localeCompare(b.accountString ?? "") ??
    a.rawName.localeCompare(b.rawName)
  );

  const colorById = new Map(
    ordered.map((fs, i) => [fs.id, paletteColorForVisibleIndex(i)])
  );

  return {
    ...snapshot,
    fundingSources: snapshot.fundingSources.map((fs) => ({
      ...fs,
      color: colorById.get(fs.id) ?? fs.color,
    })),
  };
}
