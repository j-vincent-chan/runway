"use client";

import { useApp } from "@/context/AppContext";
import { ActiveDatasetBanner } from "@/components/data-sources/ActiveDatasetBanner";
import { PayrollReportCard } from "@/components/data-sources/PayrollReportCard";
import { PortfolioFilesCard } from "@/components/data-sources/PortfolioFilesCard";
import { NetPositionFilesCard } from "@/components/data-sources/NetPositionFilesCard";
import { PositionSalaryFilesCard } from "@/components/data-sources/PositionSalaryFilesCard";
import { ImportHealthCard } from "@/components/data-sources/ImportHealthCard";
import { WhatThisPowersCard } from "@/components/data-sources/WhatThisPowersCard";
import { DataRulesCard } from "@/components/data-sources/DataRulesCard";
import { DangerZone } from "@/components/data-sources/DangerZone";
import { Header } from "@/components/layout/Header";

export default function DataSourcesPage() {
  const {
    snapshot,
    pendingPreview,
    portfolioImports,
    payrollImports,
    netPositionImports,
    positionSalaryImports,
    clearAll,
  } = useApp();

  const hasPayroll = !!snapshot && snapshot.parseStatus !== "failed";
  const hasStoredData =
    !!snapshot ||
    !!pendingPreview ||
    portfolioImports.length > 0 ||
    payrollImports.length > 0 ||
    netPositionImports.length > 0 ||
    positionSalaryImports.length > 0;

  const handleClearAll = () => {
    if (
      !confirm(
        "Clear all data from this browser?\n\nThis removes imported payroll data, timeline edits, scenarios, hidden funds, and planning scope. MyPortfolio files, Net Position reports, Employee and Position Salary reports, account aliases, and funding sources are kept."
      )
    ) {
      return;
    }
    clearAll();
  };

  return (
    <>
      <Header
        ledgerTitle
        title="Data Sources"
        subtitle="Manage the reports that power Runway."
        showImportMeta={false}
        topAction={
          hasPayroll ? { label: "View Timeline", href: "/timeline" } : undefined
        }
      />
      <main className="flex-1 overflow-auto bg-slate-50/60 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {snapshot && !pendingPreview && <ActiveDatasetBanner snapshot={snapshot} />}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6">
              <PayrollReportCard />
              <PortfolioFilesCard />
              <NetPositionFilesCard />
              <PositionSalaryFilesCard />
            </div>

            <aside className="space-y-4">
              <ImportHealthCard
                snapshot={snapshot}
                portfolioImports={portfolioImports}
                netPositionImports={netPositionImports}
                positionSalaryImports={positionSalaryImports}
                payrollImportCount={payrollImports.length}
                pendingWarningCount={pendingPreview?.warnings.length ?? 0}
              />
              <WhatThisPowersCard
                hasPayroll={hasPayroll}
                hasPortfolio={portfolioImports.length > 0}
                hasNetPosition={netPositionImports.length > 0}
                hasPositionSalary={positionSalaryImports.length > 0}
              />
              <DataRulesCard />
              {hasStoredData && <DangerZone onClearAll={handleClearAll} />}
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
