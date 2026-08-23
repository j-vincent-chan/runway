"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  buildFundingTypeMix,
  buildPersonnelCostTrend,
  type FundingMixPeriod,
} from "@/lib/dashboard/metrics";
import { buildDashboardInsights } from "@/lib/dashboard/insights";
import { buildAttentionQueue, buildRunwayContext } from "@/lib/dashboard/attention";
import { buildDashboardOverview } from "@/lib/dashboard/overview";
import { buildVerdict } from "@/lib/dashboard/verdict";
import { buildAccountBalanceView } from "@/lib/net-position/accountBalancesView";
import { KeyChangesSection } from "@/components/dashboard/KeyChangesSection";
import { VerdictStatement } from "@/components/dashboard/VerdictStatement";
import { AnchorStats } from "@/components/dashboard/AnchorStats";
import { PersonnelByGroupSection } from "@/components/dashboard/PersonnelByGroupSection";
import { PersonnelCostTrendCharts } from "@/components/dashboard/PersonnelCostTrendCharts";
import { FundingTypeDonutSection } from "@/components/dashboard/FundingTypeDonutChart";

export function DashboardContent({ horizonMonths }: { horizonMonths: number }) {
  const {
    snapshot,
    fundingSources,
    settings,
    workingPlan,
    mergedPortfolioBalances,
    netPositionImports,
  } = useApp();
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

  const accountItems = useMemo(
    () =>
      buildAccountBalanceView({
        netPositionImports,
        portfolioBalances: mergedPortfolioBalances,
        hiddenKeys: settings.hiddenAccountBalanceKeys ?? [],
        watchedPortfolioKeys: settings.watchedPortfolioAccountKeys ?? [],
        aliases: settings.fundingSourceAliases,
        accountGroupByBalanceKey: settings.accountGroupByBalanceKey,
      }),
    [
      netPositionImports,
      mergedPortfolioBalances,
      settings.hiddenAccountBalanceKeys,
      settings.watchedPortfolioAccountKeys,
      settings.fundingSourceAliases,
      settings.accountGroupByBalanceKey,
    ]
  );

  const overview = useMemo(() => {
    if (!trend) return null;
    return buildDashboardOverview({
      monthly: trend.monthly,
      planningMonth: trend.planningMonth,
      accountItems,
      netPositionImports,
    });
  }, [trend, accountItems, netPositionImports]);

  const attentionQueue = useMemo(() => {
    if (!snapshot || !trend || !runway) return null;
    return buildAttentionQueue({
      snapshot,
      fundingSources,
      settings,
      planningMonth: trend.planningMonth,
      horizonMonths,
      runway,
    });
  }, [snapshot, fundingSources, settings, trend, runway, horizonMonths]);

  const verdict = useMemo(() => {
    if (!trend || !overview || !attentionQueue) return null;
    return buildVerdict({
      planningMonth: trend.planningMonth,
      horizonMonths,
      runwayMonths: overview.runwayMonths,
      hasFunds: overview.hasFunds,
      hasBurn: overview.hasBurn,
      peopleAtRisk: attentionQueue.peopleAtRisk,
      accountsAtRisk: attentionQueue.accountsAtRisk,
      overdrawnAccounts: attentionQueue.overdrawnAccounts,
    });
  }, [trend, overview, attentionQueue, horizonMonths]);

  if (!snapshot || !trend || !funding || !overview || !verdict) return null;

  return (
    <div className="space-y-8">
      <VerdictStatement verdict={verdict} overview={overview} />
      <AnchorStats overview={overview} />
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
