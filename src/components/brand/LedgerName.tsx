import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

type LedgerNameSize = "sm" | "md" | "lg" | "sidebar";

const sizeClasses: Record<LedgerNameSize, { name: string; alpha: string }> = {
  sm: { name: "text-sm font-semibold", alpha: "relative top-[0.16em] text-[0.5em] tracking-[0.12em]" },
  md: { name: "text-base font-semibold", alpha: "relative top-[0.18em] text-[0.48em] tracking-[0.14em]" },
  lg: { name: "text-xl font-semibold", alpha: "relative top-[0.22em] text-[0.45em] tracking-[0.16em]" },
  sidebar: {
    name: "text-2xl font-bold tracking-tight",
    alpha: "relative top-[0.28em] text-[0.42em] tracking-[0.14em]",
  },
};

export function LedgerName({
  className,
  size = "md",
  showAlpha = true,
  light = false,
}: {
  className?: string;
  size?: LedgerNameSize;
  showAlpha?: boolean;
  /** White text + muted alpha (sidebar on navy). */
  light?: boolean;
}) {
  const styles = sizeClasses[size];
  return (
    <span className={cn("inline-flex items-baseline leading-none", className)}>
      <span className={cn(styles.name, light ? "text-white" : "text-[#0c2340]")}>
        {PRODUCT_NAME}
      </span>
      {showAlpha && (
        <sup
          className={cn(
            "ml-0.5 font-medium leading-none",
            styles.alpha,
            light ? "text-[#E9A6C0]" : "text-red-600"
          )}
        >
          ALPHA
        </sup>
      )}
    </span>
  );
}
