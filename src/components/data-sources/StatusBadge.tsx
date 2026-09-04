import { cn } from "@/lib/utils/cn";

export function StatusBadge({
  status,
}: {
  status: "success" | "partial" | "failed" | string;
}) {
  const normalized = status === "success" ? "success" : status === "partial" ? "partial" : status === "failed" ? "failed" : "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        normalized === "success" && "bg-healthy-soft text-healthy",
        normalized === "partial" && "bg-caution-soft text-caution",
        normalized === "failed" && "bg-critical-soft text-critical",
        normalized === "neutral" && "bg-inset text-ink-2"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          normalized === "success" && "bg-healthy",
          normalized === "partial" && "bg-caution",
          normalized === "failed" && "bg-critical",
          normalized === "neutral" && "bg-muted"
        )}
      />
      {status === "success" ? "Success" : status === "partial" ? "Partial" : status === "failed" ? "Failed" : status}
    </span>
  );
}
