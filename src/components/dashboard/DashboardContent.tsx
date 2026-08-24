"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { buildPersonnelCostTrend } from "@/lib/dashboard/metrics";
import { buildAttentionQueue, buildRunwayContext } from "@/lib/dashboard/attention";
import { buildDashboardOverview } from "@/lib/dashboard/overview";
import { buildVerdict } from "@/lib/dashboard/verdict";
import { buildRunwayRibbon } from "@/lib/dashboard/runwayRibbon";
import { buildSinceLastReport } from "@/lib/dashboard/sinceLastReport";
import { buildFundingExposureMatrix, buildFundingExposureTimeline } from "@/lib/dashboard/fundingExposure";
import { buildAccountBalanceView } from "@/lib/net-position/accountBalancesView";
import { FundingStatusPanel } from "@/components/dashboard/FundingStatusPanel";
import { AttentionQueueBox } from "@/components/dashboard/AttentionQueueBox";
import { AnchorStats } from "@/components/dashboard/AnchorStats";
import { SinceLastReportPanel } from "@/components/dashboard/SinceLastReportPanel";
import { RunwayRibbon } from "@/components/dashboard/RunwayRibbon";
import { FundingExposureBand } from "@/components/dashboard/FundingExposureBand";
import { FundingExposureMatrix } from "@/components/dashboard/FundingExposureMatrix";
import { DashboardMethodology } from "@/components/dashboard/DashboardMethodology";
import { PersonnelByGroupSection } from "@/components/dashboard/PersonnelByGroupSection";
import { PersonnelCostTrendCharts } from "@/components/dashboard/PersonnelCostTrendCharts";

export function DashboardContent({ horizonMonths }: { horizonMonths: number }) {
  const {
    snapshot,
    fundingSources,
    settings,
    workingPlan,
    mergedPortfolioBalances,
    netPositionImports,
    payrollImports,
  } = useApp();

  const trend = useMemo(
    () =>
      snapshot
        ? buildPersonnelCostTrend(snapshot, settings, undefined, {
            workingPlan,
            portfolio: mergedPortfolioBalances,
            horizonMonths,
          })
        : null,
    [snapshot, settings, workingPlan, mergedPortfolioBalances, horizonMonths]
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
    if (!trend || !runway || !snapshot) return null;
    return buildDashboardOverview({
      monthly: trend.monthly,
      planningMonth: trend.planningMonth,
      accountItems,
      netPositionImports,
      runway,
      employees: snapshot.employees,
      settings,
    });
  }, [trend, runway, snapshot, accountItems, netPositionImports, settings]);

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

  const ribbon = useMemo(() => {
    if (!snapshot) return null;
    return buildRunwayRibbon({
      snapshot,
      workingPlan,
      settings,
      portfolio: mergedPortfolioBalances,
    });
  }, [snapshot, workingPlan, settings, mergedPortfolioBalances]);

  const sinceLastReport = useMemo(() => {
    if (!snapshot || !trend || !overview) return null;
    return buildSinceLastReport({
      payrollImports,
      currentSnapshot: snapshot,
      currentPlanningMonth: trend.planningMonth,
      currentMonthlyBurn: overview.monthlyBurn,
      currentRunwayMonths: overview.runwayMonths,
      workingPlan,
      fundingSources,
      settings,
      portfolio: mergedPortfolioBalances,
    });
  }, [snapshot, trend, overview, payrollImports, workingPlan, fundingSources, settings, mergedPortfolioBalances]);

  const exposureTimeline = useMemo(() => {
    if (!snapshot) return null;
    return buildFundingExposureTimeline({
      snapshot,
      workingPlan,
      fundingSources,
      settings,
      portfolio: mergedPortfolioBalances,
      horizonMonths,
    });
  }, [snapshot, workingPlan, fundingSources, settings, mergedPortfolioBalances, horizonMonths]);

  const exposureMatrix = useMemo(() => {
    if (!snapshot || !trend || !exposureTimeline) return null;
    return buildFundingExposureMatrix({
      snapshot,
      fundingSources,
      settings,
      planningMonth: trend.planningMonth,
      categories: exposureTimeline.bands,
    });
  }, [snapshot, trend, exposureTimeline, fundingSources, settings]);

  if (!snapshot || !trend || !overview || !verdict || !attentionQueue) return null;

  const isAction = attentionQueue.rows.length > 0 && verdict.kind !== "insufficient_data";
  const hasMoreRows = isAction && attentionQueue.rows.length > 1;

  return (
    <div className="space-y-8">
      <FundingStatusPanel verdict={verdict} queue={attentionQueue} />
      {hasMoreRows ? (
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-5">
            <AttentionQueueBox queue={attentionQueue} />
          </div>
          <div className="col-span-12 lg:col-span-7">
            <AnchorStats overview={overview} />
          </div>
        </div>
      ) : (
        <AnchorStats overview={overview} />
      )}
      {sinceLastReport && <SinceLastReportPanel summary={sinceLastReport} />}
      <RunwayRibbon ribbon={ribbon} />
      <PersonnelCostTrendCharts
        monthly={trend.monthly}
        monthlyProjected={trend.monthlyProjected}
        planningMonth={trend.planningMonth}
        activeRuleCount={settings.projectionRules?.length ?? 0}
      />
      <PersonnelByGroupSection
        groupBreakdown={trend.groupBreakdown}
        planningMonth={trend.planningMonth}
      />
      <FundingExposureBand timeline={exposureTimeline} />
      <FundingExposureMatrix matrix={exposureMatrix} />
      <DashboardMethodology projectedMonthCount={trend.monthlyProjected.length} />
    </div>
  );
}
