import type { MonthlyAllocation, PayrollReportSnapshot } from "@/types";
import { roundPercentDisplay } from "@/lib/utils/parse";

export interface TimelineSegment {
  months: string[];
  colspan: number;
  percentEffort: number;
  isFuture: boolean;
  isEdited: boolean;
  allocation?: MonthlyAllocation;
}

function segmentKey(
  pct: number,
  isFuture: boolean,
  isEdited: boolean
): string {
  return `${roundPercentDisplay(pct)}|${isFuture}|${isEdited}`;
}

export function buildTimelineSegments(
  months: string[],
  getAlloc: (month: string) => MonthlyAllocation | undefined,
  snapshot: PayrollReportSnapshot
): TimelineSegment[] {
  if (months.length === 0) return [];

  const segments: TimelineSegment[] = [];
  let i = 0;

  while (i < months.length) {
    const month = months[i];
    const alloc = getAlloc(month);
    const pct = alloc?.percentEffort ?? 0;
    const isFuture = snapshot.futureMonths.includes(month);
    const isEdited = alloc?.status === "edited";
    const key = segmentKey(pct, isFuture, isEdited);

    let j = i + 1;
    while (j < months.length) {
      const m2 = months[j];
      const a2 = getAlloc(m2);
      const pct2 = a2?.percentEffort ?? 0;
      const k2 = segmentKey(
        pct2,
        snapshot.futureMonths.includes(m2),
        a2?.status === "edited"
      );
      if (k2 !== key) break;
      j++;
    }

    segments.push({
      months: months.slice(i, j),
      colspan: j - i,
      percentEffort: roundPercentDisplay(pct),
      isFuture,
      isEdited,
      allocation: alloc,
    });
    i = j;
  }

  return segments;
}
