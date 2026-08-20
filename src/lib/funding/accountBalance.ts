import type { FundingSource } from "@/types";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";
import { findBalanceForChartstring } from "@/lib/funding/chartstring";

export function getFundingSourceNetBalance(
  fs: FundingSource,
  mergedPortfolioBalances: Map<string, MergedPortfolioBalance>
): number | undefined {
  const chartstring = fs.accountString ?? fs.rawName;
  if (!chartstring?.trim()) return undefined;

  const balanceMap = new Map<string, number>();
  for (const [k, v] of mergedPortfolioBalances) {
    balanceMap.set(k, v.balance);
  }
  return findBalanceForChartstring(chartstring, balanceMap)?.balance;
}
