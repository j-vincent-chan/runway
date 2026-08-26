import { describe, expect, it } from "vitest";
import {
  getFundingSourceCategory,
  getFundingSourceCategoryForAccountKey,
  setCategoryForAccountKey,
} from "@/lib/funding/accountCategory";
import { DEFAULT_SETTINGS } from "@/types";
import type { AppSettings, FundingSource } from "@/types";

const ACCOUNT = "7000-142062-7032261";

function source(chartstring: string, id = chartstring): FundingSource {
  return {
    id,
    rawName: chartstring,
    alias: chartstring,
    accountString: chartstring,
    color: "#00778b",
  };
}

function settingsWith(categories: Record<string, string>): AppSettings {
  return { ...DEFAULT_SETTINGS, fundingSourceCategories: categories } as AppSettings;
}

describe("getFundingSourceCategory", () => {
  it("reaches a chartstring with an activity segment from the account key", () => {
    const settings = settingsWith({ [ACCOUNT]: "federal" });
    expect(getFundingSourceCategory(settings, source(`${ACCOUNT}-45`))).toBe("federal");
  });

  it("lets an exact chartstring assignment win over the account key", () => {
    const settings = settingsWith({ [ACCOUNT]: "federal", [`${ACCOUNT}-45`]: "gift" });
    expect(getFundingSourceCategory(settings, source(`${ACCOUNT}-45`))).toBe("gift");
  });
});

describe("getFundingSourceCategoryForAccountKey", () => {
  it("prefers the account-level assignment", () => {
    const settings = settingsWith({ [ACCOUNT]: "federal" });
    expect(
      getFundingSourceCategoryForAccountKey(settings, ACCOUNT, [source(`${ACCOUNT}-45`)])
    ).toBe("federal");
  });

  it("falls back to a chartstring beneath the account so nothing reads as unset", () => {
    const settings = settingsWith({ [`${ACCOUNT}-45`]: "gift" });
    expect(
      getFundingSourceCategoryForAccountKey(settings, ACCOUNT, [source(`${ACCOUNT}-45`)])
    ).toBe("gift");
  });

  it("returns nothing for an account with no assignment anywhere", () => {
    expect(
      getFundingSourceCategoryForAccountKey(settingsWith({}), ACCOUNT, [source(`${ACCOUNT}-45`)])
    ).toBeUndefined();
  });
});

describe("setCategoryForAccountKey", () => {
  it("collapses per-chartstring entries under the account it sets", () => {
    const next = setCategoryForAccountKey(
      { [`${ACCOUNT}-45`]: "gift", [`${ACCOUNT}-42`]: "federal" },
      ACCOUNT,
      "state"
    );
    expect(next).toEqual({ [ACCOUNT]: "state" });
  });

  it("leaves other accounts alone", () => {
    const next = setCategoryForAccountKey(
      { [`${ACCOUNT}-45`]: "gift", "7700-129074-7702322": "federal" },
      ACCOUNT,
      "state"
    );
    expect(next["7700-129074-7702322"]).toBe("federal");
  });

  it("clears the account entirely when set to null", () => {
    const next = setCategoryForAccountKey(
      { [ACCOUNT]: "state", [`${ACCOUNT}-45`]: "gift" },
      ACCOUNT,
      null
    );
    expect(next).toEqual({});
  });
});
