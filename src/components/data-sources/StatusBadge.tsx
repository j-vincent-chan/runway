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
        normalized === "success" && "bg-emerald-100 text-emerald-800",
        normalized === "partial" && "bg-amber-100 text-amber-800",
        normalized === "failed" && "bg-red-100 text-red-800",
        normalized === "neutral" && "bg-slate-100 text-slate-700"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          normalized === "success" && "bg-emerald-500",
          normalized === "partial" && "bg-amber-500",
          normalized === "failed" && "bg-red-500",
          normalized === "neutral" && "bg-slate-400"
        )}
      />
      {status === "success" ? "Success" : status === "partial" ? "Partial" : status === "failed" ? "Failed" : status}
    </span>
  );
}
