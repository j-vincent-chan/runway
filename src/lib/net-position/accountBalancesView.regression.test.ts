import { describe, expect, it } from "vitest";
import { buildAccountBalanceView } from "@/lib/net-position/accountBalancesView";
import type { NetPositionReportImport } from "@/types";

function np(endingBalance: number, periodEnd: string, id: string): NetPositionReportImport {
  return {
    id,
    sourceFileName: `np-${periodEnd}.xlsx`,
    reportRunDate: "2026-08-21",
    periodEnd,
    uploadedAt: "2026-08-01T00:00:00.000Z",
    rows: [
      {
        accountKey: "7700-129074-7702322",
        busUnit: "SFCMP",
        fund: "7700",
        dept: "129074",
        project: "7702322",
        beginningBalance: 0,
        revenues: 0,
        expenses: 0,
        otherChanges: 0,
        netChange: 0,
        endingBalance,
      },
    ],
  } as NetPositionReportImport;
}

describe("an account reported over two periods", () => {
  const imports = [np(57741.29, "2026-06", "a"), np(41943.5, "2026-08", "b")];

  it("lists the latest balance and keeps its period delta", () => {
    const items = buildAccountBalanceView({
      netPositionImports: imports,
      hiddenKeys: [],
      aliases: {},
      accountGroupByBalanceKey: {},
    });

    const item = items.find((i) => i.accountKey === "7700-129074-7702322");
    expect(item?.displayBalance).toBeCloseTo(41943.5, 2);
    // 41,943.50 − 57,741.29: the drop is the whole point of the column.
    expect(item?.changeFromPrior).toBeCloseTo(-15797.79, 2);
  });
});
