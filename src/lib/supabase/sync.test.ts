import { describe, expect, it } from "vitest";
import { mergeRemoteSettings } from "@/lib/supabase/sync";
import { DEFAULT_SETTINGS } from "@/types";

describe("mergeRemoteSettings", () => {
  it("merges remote account group and funding source category assignments additively", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      accountGroupByBalanceKey: { "acct-1": "core" },
      fundingSourceCategories: { "fund-1": "grant" },
    };
    const merged = mergeRemoteSettings(
      local,
      {},
      [],
      [],
      { "acct-2": "not-mine" },
      { "fund-2": "training" }
    );
    expect(merged.accountGroupByBalanceKey).toEqual({ "acct-1": "core", "acct-2": "not-mine" });
    expect(merged.fundingSourceCategories).toEqual({ "fund-1": "grant", "fund-2": "training" });
  });

  it("lets a remote value overwrite a matching local key (remote wins on conflict)", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      accountGroupByBalanceKey: { "acct-1": "core" },
    };
    const merged = mergeRemoteSettings(local, {}, [], [], { "acct-1": "not-mine" }, undefined);
    expect(merged.accountGroupByBalanceKey).toEqual({ "acct-1": "not-mine" });
  });

  it("tolerates missing remote maps", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      accountGroupByBalanceKey: { "acct-1": "core" },
      fundingSourceCategories: { "fund-1": "grant" },
    };
    const merged = mergeRemoteSettings(local, {}, [], []);
    expect(merged.accountGroupByBalanceKey).toEqual({ "acct-1": "core" });
    expect(merged.fundingSourceCategories).toEqual({ "fund-1": "grant" });
  });
});
