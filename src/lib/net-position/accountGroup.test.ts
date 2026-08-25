import { describe, expect, it } from "vitest";
import {
  ensureAccountGroups,
  getAccountGroups,
  isNotMyAccountKey,
} from "@/lib/net-position/accountGroup";
import {
  MY_ACCOUNTS_GROUP_ID,
  NOT_MY_ACCOUNTS_GROUP_ID,
} from "@/lib/catalog/defaults";
import { DEFAULT_SETTINGS, type AccountGroupDef, type AppSettings } from "@/types";

function custom(id: string, label: string, sortOrder: number): AccountGroupDef {
  return { id, label, pillClass: "", dotClass: "", chartColor: "#000", sortOrder };
}

describe("ensureAccountGroups", () => {
  it("seeds both built-ins when there are none", () => {
    const out = ensureAccountGroups({ ...DEFAULT_SETTINGS, accountGroups: undefined });
    const ids = getAccountGroups(out).map((g) => g.id);
    expect(ids).toContain(MY_ACCOUNTS_GROUP_ID);
    expect(ids).toContain(NOT_MY_ACCOUNTS_GROUP_ID);
  });

  it("seeds them for a workspace that already has an empty array", () => {
    // Every existing workspace has `accountGroups: []`. An early return on the
    // key being present would skip seeding for exactly those users.
    const out = ensureAccountGroups({ ...DEFAULT_SETTINGS, accountGroups: [] });
    expect(getAccountGroups(out)).toHaveLength(2);
  });

  it("keeps custom groups and does not duplicate the built-ins", () => {
    const seeded = ensureAccountGroups({ ...DEFAULT_SETTINGS, accountGroups: [] });
    const withCustom: AppSettings = {
      ...seeded,
      accountGroups: [...(seeded.accountGroups ?? []), custom("grants", "Grants", 5)],
    };
    const out = ensureAccountGroups(withCustom);
    const ids = getAccountGroups(out).map((g) => g.id);
    expect(ids).toEqual([MY_ACCOUNTS_GROUP_ID, NOT_MY_ACCOUNTS_GROUP_ID, "grants"]);
  });

  it("returns the same object when nothing is missing, so no pointless write", () => {
    const seeded = ensureAccountGroups({ ...DEFAULT_SETTINGS, accountGroups: [] });
    expect(ensureAccountGroups(seeded)).toBe(seeded);
  });

  it("does not resurrect a deleted custom group", () => {
    const seeded = ensureAccountGroups({ ...DEFAULT_SETTINGS, accountGroups: [] });
    const out = ensureAccountGroups({ ...seeded, accountGroups: seeded.accountGroups });
    expect(getAccountGroups(out).map((g) => g.id)).not.toContain("grants");
  });
});

describe("isNotMyAccountKey", () => {
  const settings = ensureAccountGroups({
    ...DEFAULT_SETTINGS,
    accountGroups: [],
    accountGroupByBalanceKey: { "4301-142062-136092l": NOT_MY_ACCOUNTS_GROUP_ID },
  });

  it("reads the stored assignment", () => {
    expect(isNotMyAccountKey(settings, "4301-142062-136092l")).toBe(true);
  });

  it("treats an unassigned account as mine", () => {
    // Only "not mine" is ever stored; absence means normal.
    expect(isNotMyAccountKey(settings, "7000-142062-7032261")).toBe(false);
  });

  it("treats an explicit My accounts assignment as mine", () => {
    const mine = {
      ...settings,
      accountGroupByBalanceKey: { "7000-1-1": MY_ACCOUNTS_GROUP_ID },
    };
    expect(isNotMyAccountKey(mine, "7000-1-1")).toBe(false);
  });

  it("matches regardless of chartstring casing", () => {
    expect(isNotMyAccountKey(settings, "4301-142062-136092L")).toBe(true);
  });
});
