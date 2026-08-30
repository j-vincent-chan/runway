import { buildSinceLastReportSentence, type SinceLastReportSummary } from "@/lib/dashboard/sinceLastReport";

export function SinceLastReportPanel({ summary }: { summary: SinceLastReportSummary }) {
  return (
    <section aria-label="Change since the previous report">
      <h2 className="type-caption text-muted">Since the {summary.priorLabel} report</h2>
      <p className="type-row mt-1 text-ink">{buildSinceLastReportSentence(summary)}</p>
    </section>
  );
}
