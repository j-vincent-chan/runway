import { describe, expect, it } from "vitest";
import {
  accountsHiddenForEveryone,
  effectiveHiddenAccountKeys,
  hiddenFundKey,
} from "@/lib/funding/visibility";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types";

const ACCOUNT = "7000-142062-7032261";
const OTHER = "4301-142062-136092l";

function pairs(...entries: [string, string, string][]) {
  return entries.map(([employeeId, fundingSourceId, accountKey]) => ({
    employeeId,
    fundingSourceId,
    accountKey,
  }));
}

function withHidden(...keys: string[]): AppSettings {
  return { ...DEFAULT_SETTINGS, hiddenEmployeeFunds: keys };
}

describe("accountsHiddenForEveryone", () => {
  it("keeps an account visible while anyone still has it showing", () => {
    // Ada hid it; Bob did not, and Bob is still paid from it.
    const settings = withHidden(hiddenFundKey("ada", "f1"));
    const hidden = accountsHiddenForEveryone(
      pairs(["ada", "f1", ACCOUNT], ["bob", "f1", ACCOUNT]),
      settings
    );
    expect(hidden.has(ACCOUNT)).toBe(false);
  });

  it("hides the account once every person charging it has hidden it", () => {
    const settings = withHidden(hiddenFundKey("ada", "f1"), hiddenFundKey("bob", "f1"));
    const hidden = accountsHiddenForEveryone(
      pairs(["ada", "f1", ACCOUNT], ["bob", "f1", ACCOUNT]),
      settings
    );
    expect(hidden.has(ACCOUNT)).toBe(true);
  });

  it("treats each account separately", () => {
    const settings = withHidden(hiddenFundKey("ada", "f1"));
    const hidden = accountsHiddenForEveryone(
      pairs(["ada", "f1", ACCOUNT], ["ada", "f2", OTHER]),
      settings
    );
    expect([...hidden]).toEqual([ACCOUNT]);
  });

  it("never hides an account nobody charges", () => {
    expect(accountsHiddenForEveryone([], withHidden()).size).toBe(0);
  });
});

describe("effectiveHiddenAccountKeys", () => {
  it("unions explicit hides with the derived ones", () => {
    const settings: AppSettings = { ...DEFAULT_SETTINGS, hiddenAccountBalanceKeys: [OTHER] };
    expect(effectiveHiddenAccountKeys(settings, new Set([ACCOUNT])).sort()).toEqual(
      [ACCOUNT, OTHER].sort()
    );
  });

  it("lets an explicit reveal win over the derived hide", () => {
    // Otherwise an account hidden for everyone on Runway could never be shown
    // again from Settings, since nothing stores that hide to remove.
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      unhiddenAccountBalanceKeys: [ACCOUNT],
    };
    expect(effectiveHiddenAccountKeys(settings, new Set([ACCOUNT]))).toEqual([]);
  });

  it("lets an explicit reveal win over an explicit hide too", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      hiddenAccountBalanceKeys: [ACCOUNT],
      unhiddenAccountBalanceKeys: [ACCOUNT],
    };
    expect(effectiveHiddenAccountKeys(settings, new Set())).toEqual([]);
  });
});
