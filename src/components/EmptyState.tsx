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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <LedgerLogo size={32} />
      </div>
      <h2 className="text-lg font-semibold text-[#0c2340]">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-600">{message}</p>
      <Link
        href={actionHref}
        className="mt-6 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
