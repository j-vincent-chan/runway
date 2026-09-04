import { RUNWAY_ACCENT } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

/**
 * The Runway mark: a months-remaining meter — three bars at full, two-thirds,
 * one-third, each on its own track. Monochrome teal per the design system
 * (one accent; the old stacked-sheets mark spent the ImmunoX petal palette).
 */
export function LedgerLogo({
  className,
  size = 28,
  onDark = false,
}: {
  className?: string;
  size?: number;
  /** Light-teal fills and translucent tracks for navy grounds (sidebar, login). */
  onDark?: boolean;
}) {
  /*
   * The navy ground is dark in both themes, so it pins the on-dark teal over a
   * translucent white track. Everywhere else the mark rides the theme: a fixed
   * on-light teal with a light track inverted the meter on a dark card.
   */
  const fill = onDark ? RUNWAY_ACCENT.onDark : "var(--accent)";
  const track = onDark ? "#FFFFFF" : "var(--accent-soft)";
  const trackOpacity = onDark ? 0.16 : 1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect x="5" y="7" width="30" height="6.5" rx="2" fill={fill} />
      <rect x="5" y="16.75" width="30" height="6.5" rx="2" fill={track} fillOpacity={trackOpacity} />
      <rect x="5" y="16.75" width="20" height="6.5" rx="2" fill={fill} />
      <rect x="5" y="26.5" width="30" height="6.5" rx="2" fill={track} fillOpacity={trackOpacity} />
      <rect x="5" y="26.5" width="10" height="6.5" rx="2" fill={fill} />
    </svg>
  );
}
