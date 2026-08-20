import type { FundingSource } from "@/types";
import { FUNDING_COLORS } from "@/types";

/** Muted fill when a hidden fund row is revealed in the grid. */
export const HIDDEN_FUND_BAR_COLOR = "#e2e8f0";

const PALETTE_STEP = 5;

/** Palette slot for a visible row index — steps through hues so neighbors differ. */
export function paletteColorForVisibleIndex(visibleIndex: number): string {
  const len = FUNDING_COLORS.length;
  return FUNDING_COLORS[(visibleIndex * PALETTE_STEP) % len];
}

/**
 * Assign bar colors from the current visible row order for one employee.
 * Hidden funds (when shown) use a neutral grey and do not consume palette slots.
 */
export function colorsForEmployeeVisibleSources(
  sources: FundingSource[],
  isHidden: (fs: FundingSource) => boolean
): Map<string, string> {
  const map = new Map<string, string>();
  let visibleIndex = 0;

  for (const fs of sources) {
    if (isHidden(fs)) {
      map.set(fs.id, HIDDEN_FUND_BAR_COLOR);
    } else {
      map.set(fs.id, paletteColorForVisibleIndex(visibleIndex));
      visibleIndex += 1;
    }
  }

  return map;
}
