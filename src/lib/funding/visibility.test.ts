import { describe, expect, it } from "vitest";
import {
  accountsHiddenForEveryone,
  effectiveHiddenAccountKeys,
  hiddenFundKey,
  migrateHiddenFundKeys,
} from "@/lib/funding/visibility";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { fundingSourceKey } from "@/lib/funding/sourceKey";
import { DEFAULT_SETTINGS, type AppSettings, type Employee, type FundingSource } from "@/types";

const ACCOUNT = "7000-142062-7032261";
const OTHER = "4301-142062-136092l";

function emp(id: string, name: string): Employee {
  return { id, name, appointmentPercent: 100 };
}

function fund(id: string, rawName: string): FundingSource {
  return { id, rawName, alias: rawName, color: "#000000" };
}

const ada = emp("emp-ada", "ada");
const bob = emp("emp-bob", "bob");
const f1 = fund("fs-1", "f1");
const f2 = fund("fs-2", "f2");

function hiddenKeyFor(employee: Employee, fundingSource: FundingSource): string {
  return hiddenFundKey(employeePersonKey(employee), fundingSourceKey(fundingSource));
}

function pairs(...entries: [Employee, FundingSource, string][]) {
  return entries.map(([employee, fundingSource, accountKey]) => ({
    employee,
    fundingSource,
    accountKey,
  }));
}

function withHidden(...keys: string[]): AppSettings {
  return { ...DEFAULT_SETTINGS, hiddenEmployeeFunds: keys };
}

describe("accountsHiddenForEveryone", () => {
  it("keeps an account visible while anyone still has it showing", () => {
    // Ada hid it; Bob did not, and Bob is still paid from it.
    const settings = withHidden(hiddenKeyFor(ada, f1));
    const hidden = accountsHiddenForEveryone(
      pairs([ada, f1, ACCOUNT], [bob, f1, ACCOUNT]),
      settings
    );
    expect(hidden.has(ACCOUNT)).toBe(false);
  });

  it("hides the account once every person charging it has hidden it", () => {
    const settings = withHidden(hiddenKeyFor(ada, f1), hiddenKeyFor(bob, f1));
    const hidden = accountsHiddenForEveryone(
      pairs([ada, f1, ACCOUNT], [bob, f1, ACCOUNT]),
      settings
    );
    expect(hidden.has(ACCOUNT)).toBe(true);
  });

  it("treats each account separately", () => {
    const settings = withHidden(hiddenKeyFor(ada, f1));
    const hidden = accountsHiddenForEveryone(
      pairs([ada, f1, ACCOUNT], [ada, f2, OTHER]),
      settings
    );
    expect([...hidden]).toEqual([ACCOUNT]);
  });

  it("never hides an account nobody charges", () => {
    expect(accountsHiddenForEveryone([], withHidden()).size).toBe(0);
  });

  it("keeps a hide attached to the same person/fund after ids are reassigned by a re-import", () => {
    // Ada's raw id changes across a re-import (mergeSnapshots reassigns ids),
    // but the hide is stored by stable key, so it still applies to the "new" Ada.
    const settings = withHidden(hiddenKeyFor(ada, f1));
    const reimportedAda = emp("emp-ada-v2", "ada");
    const hidden = accountsHiddenForEveryone(pairs([reimportedAda, f1, ACCOUNT]), settings);
    expect(hidden.has(ACCOUNT)).toBe(true);
  });
});

describe("migrateHiddenFundKeys", () => {
  it("converts a legacy raw-id key to a stable one when both ids still resolve", () => {
    const migrated = migrateHiddenFundKeys([hiddenFundKey(ada.id, f1.id)], [ada], [f1]);
    expect(migrated).toEqual([hiddenKeyFor(ada, f1)]);
  });

  it("leaves an already-stable key untouched", () => {
    const key = hiddenKeyFor(ada, f1);
    expect(migrateHiddenFundKeys([key], [ada], [f1])).toEqual([key]);
  });

  it("keeps an unresolvable key rather than dropping it", () => {
    const key = hiddenFundKey("gone-employee", "gone-fund");
    expect(migrateHiddenFundKeys([key], [ada], [f1])).toEqual([key]);
  });

  it("de-duplicates when two legacy keys migrate to the same stable key", () => {
    const migrated = migrateHiddenFundKeys(
      [hiddenFundKey(ada.id, f1.id), hiddenKeyFor(ada, f1)],
      [ada],
      [f1]
    );
    expect(migrated).toEqual([hiddenKeyFor(ada, f1)]);
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
