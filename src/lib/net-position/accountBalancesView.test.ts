import { describe, expect, it } from "vitest";
import {
  buildAccountBalanceView,
  filterAccountBalanceItemsByGroup,
  listPortfolioWatchCandidates,
  normalizeAccountBalanceKey,
  resolveAccountBalanceAlias,
  sortAccountBalanceItems,
  toggleKeyInList,
} from "@/lib/net-position/accountBalancesView";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";
import type { NetPositionReportImport } from "@/types";

function npImport(rows: NetPositionReportImport["rows"]): NetPositionReportImport {
  return {
    id: "np1",
    sourceFileName: "np.xlsx",
    uploadedAt: "2026-08-01T00:00:00.000Z",
    reportRunDate: "2026-07-31",
    periodEnd: "2026-07",
    sheetName: "Net Position",
    rows,
  };
}

describe("accountBalancesView", () => {
  it("normalizes account keys", () => {
    expect(normalizeAccountBalanceKey("7000-129074-7030722")).toBe("7000-129074-7030722");
    expect(normalizeAccountBalanceKey(" 7000-129074-7030722 ")).toBe("7000-129074-7030722");
  });

  it("merges Net Position with watched MyPortfolio on fund-dept-project", () => {
    const imports = [
      npImport([
        {
          accountKey: "7000-129074-7030722",
          busUnit: "SF",
          fund: "7000",
          dept: "129074",
          project: "7030722",
          projectDescription: "Sandbox Grant",
          beginningBalance: 100,
          revenues: 0,
          expenses: 10,
          otherChanges: 0,
          netChange: -10,
          endingBalance: 90,
        },
      ]),
    ];
    const portfolio = new Map<string, MergedPortfolioBalance>([
      [
        "7000-129074-7030722-01",
        {
          chartstring: "7000-129074-7030722-01",
          balance: 88,
          reportRunDate: "2026-07-31",
          sourceFileName: "mp.xlsx",
          projectTitle: "Sandbox Nickname",
          fund: "7000",
          dept: "129074",
          project: "7030722",
          activity: "01",
        },
      ],
      [
        "4000-100000-1111111-01",
        {
          chartstring: "4000-100000-1111111-01",
          balance: 50,
          reportRunDate: "2026-07-31",
          sourceFileName: "mp.xlsx",
          projectTitle: "Other Award",
          fund: "4000",
          dept: "100000",
          project: "1111111",
          activity: "01",
        },
      ],
    ]);

    const view = buildAccountBalanceView({
      netPositionImports: imports,
      portfolioBalances: portfolio,
      hiddenKeys: [],
      watchedPortfolioKeys: ["4000-100000-1111111"],
    });

    expect(view).toHaveLength(2);
    const sandbox = view.find((v) => v.accountKey === "7000-129074-7030722")!;
    expect(sandbox.source).toBe("both");
    expect(sandbox.displayBalance).toBe(88);
    expect(sandbox.changeFromPrior).toBeNull();
    expect(sandbox.series).not.toBeNull();
    expect(sandbox.series!.latest.endingBalance).toBe(90);
    expect(sandbox.portfolioBalance).toBe(88);
    expect(sandbox.withdrawals).toBe(10);

    const other = view.find((v) => v.accountKey === "4000-100000-1111111")!;
    expect(other.source).toBe("myPortfolio");
    expect(other.displayBalance).toBe(50);
    expect(other.series).toBeNull();
    expect(other.withdrawals).toBe(0);
  });

  it("marks hidden accounts and does not duplicate watched NP keys", () => {
    const imports = [
      npImport([
        {
          accountKey: "7000-129074-7030722",
          busUnit: "SF",
          fund: "7000",
          dept: "129074",
          project: "7030722",
          beginningBalance: 0,
          revenues: 0,
          expenses: 0,
          otherChanges: 0,
          netChange: 0,
          endingBalance: 10,
        },
      ]),
    ];
    const view = buildAccountBalanceView({
      netPositionImports: imports,
      portfolioBalances: new Map(),
      hiddenKeys: ["7000-129074-7030722"],
      watchedPortfolioKeys: ["7000-129074-7030722"],
    });
    expect(view).toHaveLength(1);
    expect(view[0]!.isHidden).toBe(true);
    expect(view[0]!.isWatchedFromPortfolio).toBe(true);
  });

  it("applies aliases and account groups", () => {
    const imports = [
      npImport([
        {
          accountKey: "7000-129074-7030722",
          busUnit: "SF",
          fund: "7000",
          dept: "129074",
          project: "7030722",
          projectDescription: "Sandbox Grant",
          beginningBalance: 0,
          revenues: 0,
          expenses: 5,
          otherChanges: 0,
          netChange: -5,
          endingBalance: 40,
        },
      ]),
    ];
    const view = buildAccountBalanceView({
      netPositionImports: imports,
      portfolioBalances: new Map(),
      hiddenKeys: [],
      watchedPortfolioKeys: [],
      aliases: { "7000-129074-7030722": { alias: "Friendly Name" } },
      accountGroupByBalanceKey: { "7000-129074-7030722": "core" },
    });
    expect(view[0]!.title).toBe("Friendly Name");
    expect(view[0]!.accountGroupId).toBe("core");
  });

  it("resolves aliases by chartstring root", () => {
    expect(
      resolveAccountBalanceAlias(
        { "7000-129074-7030722-01": { alias: "Root Alias" } },
        "7000-129074-7030722",
        "7000-129074-7030722-01"
      )
    ).toBe("Root Alias");
  });

  it("sorts by title, balance, and withdrawals", () => {
    const imports = [
      npImport([
        {
          accountKey: "a-1-1",
          busUnit: "SF",
          fund: "a",
          dept: "1",
          project: "1",
          projectDescription: "Zebra",
          beginningBalance: 0,
          revenues: 0,
          expenses: 100,
          otherChanges: 0,
          netChange: -100,
          endingBalance: 10,
        },
        {
          accountKey: "b-2-2",
          busUnit: "SF",
          fund: "b",
          dept: "2",
          project: "2",
          projectDescription: "Apple",
          beginningBalance: 0,
          revenues: 0,
          expenses: 1,
          otherChanges: 0,
          netChange: -1,
          endingBalance: 200,
        },
      ]),
    ];
    const byTitle = buildAccountBalanceView({
      netPositionImports: imports,
      portfolioBalances: new Map(),
      hiddenKeys: [],
      watchedPortfolioKeys: [],
      sort: "titleAsc",
    });
    expect(byTitle.map((v) => v.title)).toEqual(["Apple", "Zebra"]);

    const byBalAsc = sortAccountBalanceItems(byTitle, "balanceAsc");
    expect(byBalAsc.map((v) => v.displayBalance)).toEqual([10, 200]);

    const byWdDesc = sortAccountBalanceItems(byTitle, "withdrawalsDesc");
    expect(byWdDesc.map((v) => v.withdrawals)).toEqual([100, 1]);
  });

  it("filters by account group", () => {
    const items = buildAccountBalanceView({
      netPositionImports: [
        npImport([
          {
            accountKey: "a-1-1",
            busUnit: "SF",
            fund: "a",
            dept: "1",
            project: "1",
            beginningBalance: 0,
            revenues: 0,
            expenses: 0,
            otherChanges: 0,
            netChange: 0,
            endingBalance: 1,
          },
          {
            accountKey: "b-2-2",
            busUnit: "SF",
            fund: "b",
            dept: "2",
            project: "2",
            beginningBalance: 0,
            revenues: 0,
            expenses: 0,
            otherChanges: 0,
            netChange: 0,
            endingBalance: 2,
          },
        ]),
      ],
      portfolioBalances: new Map(),
      hiddenKeys: [],
      watchedPortfolioKeys: [],
      accountGroupByBalanceKey: { "a-1-1": "core" },
    });
    expect(filterAccountBalanceItemsByGroup(items, ["core"])).toHaveLength(1);
    expect(filterAccountBalanceItemsByGroup(items, ["unassigned"])).toHaveLength(1);
    expect(filterAccountBalanceItemsByGroup(items, [])).toHaveLength(2);
  });

  it("lists portfolio watch candidates with NP lock", () => {
    const portfolio = new Map<string, MergedPortfolioBalance>([
      [
        "7000-129074-7030722-01",
        {
          chartstring: "7000-129074-7030722-01",
          balance: 1,
          reportRunDate: "2026-07-31",
          sourceFileName: "mp.xlsx",
          fund: "7000",
          dept: "129074",
          project: "7030722",
        },
      ],
    ]);
    const candidates = listPortfolioWatchCandidates(
      portfolio,
      [
        npImport([
          {
            accountKey: "7000-129074-7030722",
            busUnit: "SF",
            fund: "7000",
            dept: "129074",
            project: "7030722",
            beginningBalance: 0,
            revenues: 0,
            expenses: 0,
            otherChanges: 0,
            netChange: 0,
            endingBalance: 1,
          },
        ]),
      ],
      []
    );
    expect(candidates[0]!.hasNetPosition).toBe(true);
    expect(candidates[0]!.isWatched).toBe(false);
  });

  it("toggles keys in preference lists", () => {
    expect(toggleKeyInList([], "A-B-C")).toEqual(["a-b-c"]);
    expect(toggleKeyInList(["a-b-c"], "A-B-C")).toEqual([]);
  });
});
