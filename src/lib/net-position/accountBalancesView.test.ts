import { describe, expect, it } from "vitest";
import {
  buildAccountBalanceView,
  filterAccountBalanceItemsByGroup,
  normalizeAccountBalanceKey,
  resolveAccountBalanceAlias,
  sortAccountBalanceItems,
} from "@/lib/net-position/accountBalancesView";
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

  it("lists one row per Net Position account", () => {
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

    const view = buildAccountBalanceView({
      netPositionImports: imports,
      hiddenKeys: [],
    });

    expect(view).toHaveLength(1);
    const sandbox = view[0]!;
    expect(sandbox.title).toBe("Sandbox Grant");
    expect(sandbox.displayBalance).toBe(90);
    expect(sandbox.series.latest.endingBalance).toBe(90);
    expect(sandbox.withdrawals).toBe(10);
  });

  it("marks hidden accounts", () => {
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
      hiddenKeys: ["7000-129074-7030722"],
    });
    expect(view).toHaveLength(1);
    expect(view[0]!.isHidden).toBe(true);
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
      hiddenKeys: [],
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
        "7000-129074-7030722"
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
      hiddenKeys: [],
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
      hiddenKeys: [],
      accountGroupByBalanceKey: { "a-1-1": "core" },
    });
    expect(filterAccountBalanceItemsByGroup(items, ["core"])).toHaveLength(1);
    expect(filterAccountBalanceItemsByGroup(items, ["unassigned"])).toHaveLength(1);
    expect(filterAccountBalanceItemsByGroup(items, [])).toHaveLength(2);
  });
});
