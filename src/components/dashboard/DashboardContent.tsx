"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  buildFundingTypeMix,
  buildPersonnelCostTrend,
  type FundingMixPeriod,
} from "@/lib/dashboard/metrics";
import { buildDashboardInsights } from "@/lib/dashboard/insights";
import { buildRunwayContext } from "@/lib/dashboard/attention";
import { KeyChangesSection } from "@/components/dashboard/KeyChangesSection";
import { PersonnelByGroupSection } from "@/components/dashboard/PersonnelByGroupSection";
import { PersonnelCostTrendCharts } from "@/components/dashboard/PersonnelCostTrendCharts";
import { FundingTypeDonutSection } from "@/components/dashboard/FundingTypeDonutChart";

export function DashboardContent() {
  const { snapshot, fundingSources, settings, workingPlan, mergedPortfolioBalances } = useApp();
  const [fundingPeriod, setFundingPeriod] = useState<FundingMixPeriod>("current_month");

  const trend = useMemo(
    () => (snapshot ? buildPersonnelCostTrend(snapshot, settings) : null),
    [snapshot, settings]
  );

  const funding = useMemo(
    () =>
      snapshot
        ? buildFundingTypeMix(snapshot, fundingSources, settings, fundingPeriod)
        : null,
    [snapshot, fundingSources, settings, fundingPeriod]
  );

  const runway = useMemo(() => {
    if (!snapshot) return null;
    return buildRunwayContext(
      snapshot,
      workingPlan,
      fundingSources,
      settings,
      mergedPortfolioBalances
    );
  }, [snapshot, workingPlan, fundingSources, settings, mergedPortfolioBalances]);

  const insights = useMemo(() => {
    if (!snapshot || !trend || !runway) return [];
    return buildDashboardInsights({
      snapshot,
      fundingSources,
      settings,
      monthly: trend.monthly,
      groupBreakdown: trend.groupBreakdown,
      planningMonth: trend.planningMonth,
      runwayMonthsByEmployee: runway.monthsByEmployee,
      limitingAccountByEmployee: runway.limitingAccountByEmployee,
    });
  }, [snapshot, fundingSources, settings, trend, runway]);

  if (!snapshot || !trend || !funding) return null;

  return (
    <div className="space-y-8">
      <KeyChangesSection insights={insights} />
      <PersonnelCostTrendCharts monthly={trend.monthly} yearly={trend.yearly} />
      <PersonnelByGroupSection
        groupBreakdown={trend.groupBreakdown}
        planningMonth={trend.planningMonth}
      />
      <FundingTypeDonutSection
        period={fundingPeriod}
        onPeriodChange={setFundingPeriod}
        periodCaption={funding.periodCaption}
        totalSlices={funding.total}
        byPersonnelType={funding.byPersonnelType}
      />
      <p className="text-[10px] text-slate-400">
        Planning estimates only. Confirm allowability with your finance/post-award analyst.
      </p>
    </div>
  );
}
