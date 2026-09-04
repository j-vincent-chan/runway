import Link from "next/link";
import { LEDGER_EMPTY_MESSAGE, LEDGER_EMPTY_TITLE } from "@/lib/brand";
import { LedgerLogo } from "@/components/brand/LedgerLogo";

export function EmptyState({
  title = LEDGER_EMPTY_TITLE,
  message = LEDGER_EMPTY_MESSAGE,
  actionLabel = "Upload Report",
  actionHref = "/upload",
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-control bg-surface px-8 py-16 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-inset">
        <LedgerLogo size={32} />
      </div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-2">{message}</p>
      <Link
        href={actionHref}
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
