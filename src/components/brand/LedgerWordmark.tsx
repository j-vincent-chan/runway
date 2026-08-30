import { PARENT_LABEL_ACADEMIC, RUNWAY_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";
import { LedgerLogo } from "@/components/brand/LedgerLogo";
import { LedgerName } from "@/components/brand/LedgerName";

type LedgerWordmarkVariant = "sidebar" | "default";

export function LedgerWordmark({
  variant = "default",
  className,
  logoSize,
}: {
  variant?: LedgerWordmarkVariant;
  className?: string;
  logoSize?: number;
}) {
  const light = variant === "sidebar";
  const resolvedLogoSize = logoSize ?? (variant === "sidebar" ? 40 : 28);
  const parentLabel = PARENT_LABEL_ACADEMIC.toUpperCase();

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LedgerLogo size={resolvedLogoSize} onDark={light} />
      <div className="min-w-0">
        <LedgerName size={variant === "sidebar" ? "sidebar" : "md"} light={light} />
        <p
          className={cn(
            "mt-0.5 font-bold leading-tight",
            variant === "sidebar"
              ? "whitespace-nowrap text-[9px] uppercase tracking-tight"
              : "text-[10px] uppercase tracking-widest"
          )}
          style={{ color: light ? RUNWAY_ACCENT.onDark : RUNWAY_ACCENT.onLight }}
        >
          {parentLabel}
        </p>
      </div>
    </div>
  );
}
