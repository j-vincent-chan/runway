import { CheckCircle2, CircleDashed, Loader } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ChangeRequestStatus } from "@/lib/supabase/changeRequests";

/**
 * One vocabulary for request state across the Status page. Pending is a
 * queue position, not a warning, so it stays neutral; healthy is reserved
 * for the confirmed-good Completed state, per the design system.
 */
export const STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

const STATUS_ICON = {
  pending: CircleDashed,
  in_progress: Loader,
  completed: CheckCircle2,
} as const;

const STATUS_CHIP_CLASS: Record<ChangeRequestStatus, string> = {
  pending: "bg-inset text-ink-2",
  in_progress: "bg-accent-soft text-accent",
  completed: "bg-healthy-soft text-healthy",
};

export function StatusChip({ status }: { status: ChangeRequestStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        "type-caption inline-flex min-w-[6.75rem] shrink-0 items-center justify-center gap-1 rounded-sm px-1.5 py-0.5",
        STATUS_CHIP_CLASS[status]
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
