"use client";

import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { TimelineGrid } from "@/components/timeline/TimelineGrid";

export default function TimelinePage() {
  const { hasData, dataMigrated } = useApp();

  return (
    <>
      <Header
        ledgerTitle
        title="Distributions"
        subtitle="Interactive personnel funding plan (actual payroll through this month)"
      />
      <main className="p-4">
        {!hasData ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-4">
            {dataMigrated && (
              <p className="rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm text-accent">
                Payroll data was refreshed with improved parsing (employees matched by HR ID, not last
                name; X+Y effort rows combined). The same grant may appear for two people in different
                months—that is a handoff, not a mix-up.
              </p>
            )}
            <div className="flex min-w-0 items-start">
              <TimelineGrid />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
