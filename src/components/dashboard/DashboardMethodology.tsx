import { CAUTION_MONTHS, CRITICAL_MONTHS, UNATTRIBUTED_THRESHOLD } from "@/lib/dashboard/attention";
import { ANOMALY_THRESHOLD } from "@/lib/dashboard/metrics";
import { BURN_WINDOW_MONTHS } from "@/lib/dashboard/overview";
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
        <Entry title="Available payroll and monthly payroll burn">
          Available payroll covers only the accounts that currently have payroll charged to them,
          at the balance Runway resolves for each — your MyPortfolio figure, or the amount you
          entered there by hand. Accounts nobody is paid from are left out, along with any
          you&rsquo;ve hidden, so the figure will not match the Account Balances total, which
          lists everything. An account you&rsquo;ve marked as not yours counts the balance its
          end date implies: its share of the burn multiplied by the months left on it. An
          account charged with no balance on file anywhere counts as $0, so the total reads low
          until you fill one in — the stat says how many are waiting. Monthly payroll burn
          averages total personnel cost — salary and benefits — across the trailing{" "}
          {BURN_WINDOW_MONTHS} months, unchanged by any of this.
        </Entry>
        <Entry title="Avg payroll runway, overall and by team">
          Available payroll divided by the combined monthly burn on those same accounts. It is an
          average across those accounts, not a floor: the month count is plain arithmetic and is
          shown in full, but the calendar date it implies is withheld once it lands past the
          window you have in view, rather than extrapolated there. Each team does the same over
          the accounts its own members draw on; an account two people share is counted once.
          Where a team shares an account with someone outside it, the whole
          account&rsquo;s burn stays in that team&rsquo;s denominator — splitting it would mean
          inventing a rule for who owns which dollar — so a shared account always reads shorter
          than it would in isolation, never longer. Individual people run dry sooner than any of
          these blends; those are named in the attention queue, and beneath their own team.
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
          Projects every account&rsquo;s balance forward across the scope you have selected
          above, by continuing each person&rsquo;s current funding mix, changing only where a projection
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
