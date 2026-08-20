"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils/cn";

/** Recharts needs positive pixel dimensions; renders after mount when width is known. */
export function ChartResponsive({
  height,
  width: fixedWidth,
  className,
  children,
}: {
  height: number;
  /** When set, skips resize measurement (use for small fixed-size charts). */
  width?: number;
  className?: string;
  children: ReactElement;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(() => {
    if (fixedWidth != null) return;
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) setMeasuredWidth(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fixedWidth]);

  const width = fixedWidth ?? measuredWidth;
  const ready = width > 0;

  return (
    <div
      ref={containerRef}
      className={cn(fixedWidth == null && "w-full min-w-0", className)}
      style={fixedWidth != null ? { width: fixedWidth, height } : { height }}
      aria-hidden={!ready}
    >
      {ready ? (
        <ResponsiveContainer width={width} height={height} minWidth={0}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
