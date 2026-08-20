"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** When frozen, the grid scrolls inside the remaining viewport so sticky month headers work. */
export function FreezeableGrid({
  freeze,
  children,
  className,
}: {
  freeze: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();

  useLayoutEffect(() => {
    if (!freeze) {
      setMaxHeight(undefined);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const top = el.getBoundingClientRect().top;
      setMaxHeight(Math.max(200, Math.floor(window.innerHeight - top - 12)));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [freeze]);

  const style: CSSProperties | undefined = freeze
    ? { maxHeight: maxHeight ?? "calc(100dvh - 14rem)" }
    : undefined;

  return (
    <div
      ref={ref}
      className={cn(freeze ? "overflow-auto" : "overflow-x-auto", className)}
      style={style}
    >
      {children}
    </div>
  );
}

export function freezeTheadClass(frozen: boolean): string {
  return cn("timeline-thead text-white", frozen && "sticky top-0 z-30");
}
