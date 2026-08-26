import type { FundingSource } from "@/types";
import type { AccountBalance } from "@/lib/funding/accountBalances";
import { findBalanceForChartstring } from "@/lib/funding/chartstring";

export function getFundingSourceNetBalance(
  fs: FundingSource,
  accountBalances: Map<string, AccountBalance>
): number | undefined {
  const chartstring = fs.accountString ?? fs.rawName;
  if (!chartstring?.trim()) return undefined;

  const balanceMap = new Map<string, number>();
  for (const [k, v] of accountBalances) {
    balanceMap.set(k, v.balance);
  }
  return findBalanceForChartstring(chartstring, balanceMap)?.balance;
}
