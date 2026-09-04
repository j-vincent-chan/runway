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
        {/* The app's caption step, not a bespoke 9/10px: both old sizes sat
            under the 11px floor. Allowed to wrap if a longer label ever
            returns — a readable second line beats an unreadable first one. */}
        {/* On the navy ground the accent is pinned to its on-dark value, since
            that ground is dark in both themes. Everywhere else it rides
            --accent, which flips: the fixed on-light teal sat at 2.5:1 once
            the card behind it went dark. */}
        <p
          className="type-caption mt-0 font-medium"
          style={{ color: light ? RUNWAY_ACCENT.onDark : "var(--accent)" }}
        >
          {parentLabel}
        </p>
      </div>
    </div>
  );
}
