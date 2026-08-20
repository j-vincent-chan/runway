import { IMMUNOX_COLORS } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

/** Three stacked isometric sheets — Bakar ImmunoX petal colors. */
export function LedgerLogo({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  const height = Math.round(size * (44 / 40));
  const { periwinkle, mint, gold } = IMMUNOX_COLORS;

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 40 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d="M6 30.5 20 38.5 34 30.5 20 22.5 6 30.5Z"
        fill={periwinkle}
        stroke="#8fa8d4"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M6 22 20 30 34 22 20 14 6 22Z"
        fill={mint}
        stroke="#6bb896"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M6 13.5 20 21.5 34 13.5 20 5.5 6 13.5Z"
        fill={gold}
        stroke="#d4a833"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}
