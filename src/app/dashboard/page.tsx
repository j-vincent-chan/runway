"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { ContextBar } from "@/components/dashboard/ContextBar";
import { buildImportContext } from "@/lib/dashboard/importContext";
import { getCurrentMonth } from "@/lib/calculations";

const DEFAULT_HORIZON_MONTHS = 12;

export default function DashboardPage() {
  const { hasData, snapshot } = useApp();
  const { configured, cloudSyncEnabled } = useAuth();
  const [horizonMonths, setHorizonMonths] = useState(DEFAULT_HORIZON_MONTHS);

  const contextBar = useMemo(() => {
    if (!snapshot) return undefined;
    const planningMonth = getCurrentMonth(snapshot);
    const context = buildImportContext(snapshot, planningMonth, configured, cloudSyncEnabled);
    return (
      <ContextBar
        context={context}
        horizonMonths={horizonMonths}
        onHorizonChange={setHorizonMonths}
      />
    );
  }, [snapshot, configured, cloudSyncEnabled, horizonMonths]);

  return (
    <>
      {/* No subtitle: "Who needs funding, personnel trends, and funding mix"
          was a table of contents, and the verdict sentence directly beneath
          now says what the page is for, in terms specific to this data. */}
      <Header ledgerTitle title="Dashboard" dashboardContextBar={contextBar} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-7xl">
          {!hasData ? <EmptyState /> : <DashboardContent horizonMonths={horizonMonths} />}
        </div>
      </main>
    </>
  );
}
