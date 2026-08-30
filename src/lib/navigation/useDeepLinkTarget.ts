"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { deepLinkAnchorId } from "@/lib/navigation/deepLinks";

/**
 * Reads a deep-link param, scrolls its row into view, and marks it so the
 * reader can see which of forty rows they were sent to. Arriving at the right
 * page with nothing highlighted is barely better than arriving at the top.
 *
 * The mark is deliberately not cleared on a timer — a highlight that vanishes
 * before someone has finished reading the row is worse than one that stays
 * until the next navigation.
 */
export function useDeepLinkTarget(
  kind: "account" | "person",
  param: string
): string | null {
  const searchParams = useSearchParams();
  // Derived straight from the URL — mirroring it into state would only add a
  // render and a chance for the two to disagree.
  const requested = searchParams.get(param);

  useEffect(() => {
    if (!requested) return;
    // The row is rendered by the same commit that runs this effect, but grids
    // below can still be laying out; one frame is enough to find the anchor.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(deepLinkAnchorId(kind, requested));
      if (!el) return;
      el.scrollIntoView({
        // Respect the motion preference the design system calls out.
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [requested, kind]);

  return requested;
}

/** Ring applied to a deep-linked row. Same treatment on every destination. */
export const DEEP_LINK_HIGHLIGHT =
  "ring-2 ring-inset ring-teal-600/70 scroll-mt-24";
