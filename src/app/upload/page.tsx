"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Header } from "@/components/layout/Header";
import { ActiveDatasetBanner } from "@/components/data-sources/ActiveDatasetBanner";
import { PayrollReportCard } from "@/components/data-sources/PayrollReportCard";
import { PortfolioFilesCard } from "@/components/data-sources/PortfolioFilesCard";
import { ImportHealthCard } from "@/components/data-sources/ImportHealthCard";
import { WhatThisPowersCard } from "@/components/data-sources/WhatThisPowersCard";
import { DataRulesCard } from "@/components/data-sources/DataRulesCard";
import { DangerZone } from "@/components/data-sources/DangerZone";

export default function DataSourcesPage() {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [showParsedData, setShowParsedData] = useState(false);

  const {
    snapshot,
    pendingPreview,
    pendingSnapshot,
    pendingMergeInfo,
    portfolioImports,
    parseFile,
    confirmImport,
    cancelImport,
    clearAll,
  } = useApp();

  const hasPayroll = !!snapshot && snapshot.parseStatus !== "failed";
  const hasStoredData = !!snapshot || !!pendingPreview || portfolioImports.length > 0;

  const handleClearAll = () => {
    if (
      !confirm(
        "Clear all data from this browser?\n\nThis removes imported payroll and MyPortfolio files, timeline edits, scenarios, hidden funds, and planning scope. Account aliases and account types are kept."
      )
    ) {
      return;
    }
    clearAll();
  };

  const triggerReplace = () => {
    replaceInputRef.current?.click();
  };

  return (
    <>
      <Header
        ledgerTitle
        title="Data Sources"
        subtitle="Manage the reports that power Runway."
        showUploadButton={false}
        showImportMeta={false}
        topAction={
          hasPayroll ? { label: "View Timeline", href: "/timeline" } : undefined
        }
      />
      <main className="flex-1 overflow-auto bg-slate-50/60 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {snapshot && !pendingPreview && (
            <ActiveDatasetBanner snapshot={snapshot} onReplace={triggerReplace} />
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6">
              <PayrollReportCard
                snapshot={snapshot}
                pendingPreview={pendingPreview}
                pendingSnapshot={pendingSnapshot}
                pendingMergeInfo={pendingMergeInfo}
                onFile={(f) => void parseFile(f)}
                onCancel={cancelImport}
                onConfirm={confirmImport}
                showParsedPreview={showParsedData}
                onToggleParsedPreview={() => setShowParsedData((v) => !v)}
              />
              <PortfolioFilesCard />
            </div>

            <aside className="space-y-4">
              <ImportHealthCard
                snapshot={snapshot}
                portfolioImports={portfolioImports}
                pendingWarningCount={pendingPreview?.warnings.length ?? 0}
              />
              <WhatThisPowersCard
                hasPayroll={hasPayroll}
                hasPortfolio={portfolioImports.length > 0}
              />
              <DataRulesCard />
              {hasStoredData && <DangerZone onClearAll={handleClearAll} />}
            </aside>
          </div>
        </div>
      </main>

      <input
        ref={replaceInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void parseFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
