import { CAUTION_MONTHS, CRITICAL_MONTHS, UNATTRIBUTED_THRESHOLD } from "@/lib/dashboard/attention";
import { ANOMALY_THRESHOLD } from "@/lib/dashboard/metrics";
import { BURN_WINDOW_MONTHS } from "@/lib/dashboard/overview";
import { RIBBON_HORIZON_MONTHS } from "@/lib/dashboard/runwayRibbon";
import { COST_MATERIALITY, RUNWAY_MATERIALITY } from "@/lib/dashboard/sinceLastReport";
import { EXPOSURE_CATEGORY_CAP } from "@/lib/dashboard/fundingExposure";
import { COST_HISTORY_WINDOW_MONTHS } from "@/components/dashboard/PersonnelCostTrendCharts";

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function Entry({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="type-row font-medium text-ink">{title}</h3>
      <p className="type-body mt-1 text-ink-2">{children}</p>
    </div>
  );
}

export function DashboardMethodology({ projectedMonthCount }: { projectedMonthCount: number }) {
  return (
    <section aria-label="How these numbers were produced">
      <h2 className="type-heading text-ink">How these numbers were produced</h2>
      <div className="mt-4 space-y-5">
        <Entry title="Available funds and monthly burn">
          Available funds sums the listed balance on every account you track on Account Balances,
          excluding any you&rsquo;ve hidden. Monthly burn averages total personnel cost — salary
          and benefits — across the trailing {BURN_WINDOW_MONTHS} months.
        </Entry>
        <Entry title="Shortest runway">
          Takes the minimum across every person&rsquo;s and every account&rsquo;s own runway,
          calculated against their own restricted funding only — never a blended total, since
          accounts can&rsquo;t be freely reallocated. An account already overdrawn shows as a
          dollar deficit rather than a negative month count.
        </Entry>
        <Entry title="Attention queue">
          An account or person is Critical when already overdrawn, or when funding runs out
          within {CRITICAL_MONTHS} months. Caution covers {CRITICAL_MONTHS}–{CAUTION_MONTHS}{" "}
          months out. A team is flagged for data quality when more than{" "}
          {pct(UNATTRIBUTED_THRESHOLD)} of its cost isn&rsquo;t charged to any funding source.
          When a person is the sole contributor to an account, only one of the two appears: the
          account, if it&rsquo;s overdrawn, or the person, if the account itself is fine but
          their own share of it runs out first — never both, for the same underlying problem.
        </Entry>
        <Entry title="Since the last report">
          Reconstructs the payroll snapshot as it stood before the most recent upload, then
          compares its cost, roster, and runway against today&rsquo;s — with today&rsquo;s
          account balances held constant on both sides, so the comparison isolates what changed
          in the payroll plan itself, not a separate funding change. A runway swing under{" "}
          {pct(RUNWAY_MATERIALITY)} of a month, or a cost swing under {pct(COST_MATERIALITY)}, is
          treated as no material change.
        </Entry>
        <Entry title="Funding depletion">
          Projects every account&rsquo;s balance forward {RIBBON_HORIZON_MONTHS} months by
          continuing each person&rsquo;s current funding mix, changing only where a projection
          rule you&rsquo;ve set says otherwise. Bands floor at $0 — they show funded capacity
          remaining, not deficit depth. Only accounts with current personnel are shown by
          default; a toggle reveals the rest.
        </Entry>
        <Entry title="Personnel cost and funding exposure">
          Both charts extend the same way: {COST_HISTORY_WINDOW_MONTHS} trailing actual months,
          solid, followed by the same forward projection — {projectedMonthCount} more months —
          hatched with a dotted edge. A month whose cost differs from the trailing 12-month average by
          more than {pct(ANOMALY_THRESHOLD)} is marked. Funding exposure caps at the top{" "}
          {EXPOSURE_CATEGORY_CAP} funding types by total exposure across the whole window, plus
          &ldquo;Other&rdquo;; cost not charged to any funding source renders as a hatched grey
          hole in the data, never a category.
        </Entry>
      </div>
    </section>
  );
}
