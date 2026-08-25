import { UNATTRIBUTED_MIX_KEY } from "@/lib/dashboard/metrics";
import { formatCurrency } from "@/lib/utils/parse";
import type { FundingExposureMatrix as FundingExposureMatrixData } from "@/lib/dashboard/fundingExposure";

export function FundingExposureMatrix({ matrix }: { matrix: FundingExposureMatrixData | null }) {
  if (!matrix || matrix.rows.length === 0) return null;

  return (
    <section aria-label="Funding exposure by team">
      <h2 className="type-caption text-muted">Funding exposure, by team</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-inset">
              <th scope="col" className="type-mono px-2 py-2 text-left font-normal text-muted">
                Team
              </th>
              {matrix.categories.map((c) => (
                <th key={c.key} scope="col" className="type-mono px-2 py-2 text-right font-normal text-muted">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.groupKey} className="border-t border-rule">
                <td className="type-row px-2 py-2 text-ink" title={row.groupFullLabel}>
                  {row.groupLabel}
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.categoryKey} className="type-row px-2 py-2 text-right tabular-nums text-ink">
                    {cell.amount > 0 ? (
                      <>
                        {cell.pct.toFixed(0)}%
                        <span className="type-mono ml-1.5 text-muted">{formatCurrency(cell.amount)}</span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {matrix.categories.some((c) => c.key === UNATTRIBUTED_MIX_KEY) && (
        <p className="type-mono mt-1.5 text-muted">Unattributed: cost not charged to any funding source.</p>
      )}
    </section>
  );
}
