/**
 * The one projected-data convention used everywhere in the product: the same
 * hue as measured data at 45% opacity, overlaid with a 45° hatch. Pattern as
 * well as opacity, so it survives greyscale and color-vision deficiency.
 */
export const PROJECTED_PATTERN_ID = "hatch-projected";
export const UNATTRIBUTED_PATTERN_ID = "hatch-unattributed";

export function projectedFill(id: string = PROJECTED_PATTERN_ID): string {
  return `url(#${id})`;
}

export function HatchPattern({
  id = PROJECTED_PATTERN_ID,
  color,
  opacity = 0.45,
}: {
  id?: string;
  color: string;
  opacity?: number;
}) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={6}
      height={6}
      patternTransform="rotate(45)"
    >
      <rect width={6} height={6} fill={color} fillOpacity={opacity * 0.4} />
      <line x1={0} y1={0} x2={0} y2={6} stroke={color} strokeOpacity={opacity} strokeWidth={2} />
    </pattern>
  );
}

/** Unattributed money reads as a hole in the data, not as a category. */
export function UnattributedPattern({ id = UNATTRIBUTED_PATTERN_ID }: { id?: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={6}
      height={6}
      patternTransform="rotate(45)"
    >
      <rect width={6} height={6} fill="var(--inset)" />
      <line x1={0} y1={0} x2={0} y2={6} stroke="var(--rule-strong)" strokeWidth={2} />
    </pattern>
  );
}
