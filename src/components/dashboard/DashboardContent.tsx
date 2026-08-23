"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  buildFundingTypeMix,
  buildPersonnelCostTrend,
  type FundingMixPeriod,
} from "@/lib/dashboard/metrics";
import { buildAttentionQueue, buildRunwayContext } from "@/lib/dashboard/attention";
import { buildDashboardOverview } from "@/lib/dashboard/overview";
import { buildVerdict } from "@/lib/dashboard/verdict";
import { buildAccountBalanceView } from "@/lib/net-position/accountBalancesView";
import { VerdictStatement } from "@/components/dashboard/VerdictStatement";
import { AnchorStats } from "@/components/dashboard/AnchorStats";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention";
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

  if (!snapshot || !trend || !funding || !overview || !verdict || !attentionQueue) return null;

  return (
    <div className="space-y-8">
      <VerdictStatement verdict={verdict} overview={overview} />
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-7">
          <AnchorStats overview={overview} />
        </div>
        <div className="col-span-12 lg:col-span-5">
          <NeedsAttention queue={attentionQueue} scopeMonths={horizonMonths} />
        </div>
      </div>
      <PersonnelCostTrendCharts monthly={trend.monthly} />
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
    </div>
  );
}
