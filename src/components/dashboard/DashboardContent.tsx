"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import {
  buildFundingTypeMix,
  buildPersonnelCostTrend,
} from "@/lib/dashboard/metrics";
import { PersonnelCostTrendCharts } from "@/components/dashboard/PersonnelCostTrendCharts";
import { FundingTypeDonutSection } from "@/components/dashboard/FundingTypeDonutChart";

export function DashboardContent() {
  const { snapshot, fundingSources, settings } = useApp();

  const data = useMemo(() => {
    if (!snapshot) return null;
    const trend = buildPersonnelCostTrend(snapshot, settings);
    const funding = buildFundingTypeMix(snapshot, fundingSources, settings);
    return { trend, funding };
  }, [snapshot, fundingSources, settings]);

  if (!data) return null;

  return (
    <div className="space-y-8">
      <PersonnelCostTrendCharts
        monthly={data.trend.monthly}
        yearly={data.trend.yearly}
      />
      <FundingTypeDonutSection
        planningMonth={data.funding.planningMonth}
        totalSlices={data.funding.total}
        byPersonnelType={data.funding.byPersonnelType}
      />
      <p className="text-[10px] text-slate-400">
        Planning estimates only. Confirm allowability with your finance/post-award analyst.
      </p>
    </div>
  );
}
