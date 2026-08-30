import { CheckCircle2, ChevronDown, CircleDashed, Loader } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  CHANGE_REQUEST_STATUSES,
  type ChangeRequestStatus,
} from "@/lib/supabase/changeRequests";

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

export function StatusChip({
  status,
  interactive = false,
}: {
  status: ChangeRequestStatus;
  /** Adds the affordance that this chip opens a menu — pair with StatusSelect. */
  interactive?: boolean;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        "type-caption inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5",
        STATUS_CHIP_CLASS[status],
        interactive && "group-hover/status:ring-1 group-hover/status:ring-rule-strong"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {STATUS_LABEL[status]}
      {interactive && <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />}
    </span>
  );
}

/**
 * The analyst's in-place status control: the chip stays the visual, a real
 * <select> sits transparent on top so keyboard and screen-reader behavior are
 * the platform's. The overlay fills the cell, so the target clears 44px even
 * though the chip itself is chip-sized.
 */
export function StatusSelect({
  status,
  personName,
  onChange,
}: {
  status: ChangeRequestStatus;
  personName: string;
  onChange: (next: ChangeRequestStatus) => void;
}) {
  return (
    <span className="group/status relative inline-flex rounded-sm focus-within:ring-2 focus-within:ring-accent">
      <StatusChip status={status} interactive />
      <select
        aria-label={`Status of ${personName}'s change request`}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={status}
        onChange={(e) => onChange(e.target.value as ChangeRequestStatus)}
      >
        {CHANGE_REQUEST_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </span>
  );
}
