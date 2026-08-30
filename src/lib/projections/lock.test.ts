import { describe, it, expect } from "vitest";
import {
  isDistributionLocked,
  isRuleLocked,
  lockedPersonKeys,
  setDistributionLock,
} from "@/lib/projections/lock";
import { DEFAULT_SETTINGS, type AppSettings, type ProjectionRule } from "@/types";

function settingsWith(locked?: string[]): AppSettings {
  return { ...DEFAULT_SETTINGS, lockedDistributions: locked };
}

function ruleFor(personKey: string): ProjectionRule {
  return {
    id: "r1",
    personKey,
    chartstringKey: "7000-129074-7030722",
    trigger: { type: "setEffort", fromMonth: "2026-09", percentEffort: 25 },
    remainder: { kind: "uncovered" },
  };
}

describe("isDistributionLocked", () => {
  it("is false for a person not in the list", () => {
    expect(isDistributionLocked(settingsWith(["ada|lovelace"]), "grace|hopper")).toBe(false);
  });

  it("is true for a person in the list", () => {
    expect(isDistributionLocked(settingsWith(["ada|lovelace"]), "ada|lovelace")).toBe(true);
  });

  it("treats settings saved before the feature as unlocked", () => {
    expect(isDistributionLocked(settingsWith(undefined), "ada|lovelace")).toBe(false);
  });
});

describe("setDistributionLock", () => {
  it("adds a key when locking", () => {
    expect(setDistributionLock(settingsWith([]), "ada|lovelace", true)).toEqual(["ada|lovelace"]);
  });

  it("does not duplicate an already-locked key", () => {
    const settings = settingsWith(["ada|lovelace"]);
    expect(setDistributionLock(settings, "ada|lovelace", true)).toEqual(["ada|lovelace"]);
  });

  it("removes only the named key when unlocking", () => {
    const settings = settingsWith(["ada|lovelace", "grace|hopper"]);
    expect(setDistributionLock(settings, "ada|lovelace", false)).toEqual(["grace|hopper"]);
  });

  it("unlocking someone who was never locked is a no-op", () => {
    const settings = settingsWith(["grace|hopper"]);
    expect(setDistributionLock(settings, "ada|lovelace", false)).toEqual(["grace|hopper"]);
  });

  it("never mutates the settings it was given", () => {
    const settings = settingsWith(["grace|hopper"]);
    setDistributionLock(settings, "ada|lovelace", true);
    expect(settings.lockedDistributions).toEqual(["grace|hopper"]);
  });

  it("handles settings saved before the feature existed", () => {
    expect(setDistributionLock(settingsWith(undefined), "ada|lovelace", true)).toEqual([
      "ada|lovelace",
    ]);
    expect(setDistributionLock(settingsWith(undefined), "ada|lovelace", false)).toEqual([]);
  });
});

describe("isRuleLocked", () => {
  it("locks a rule whose person is locked", () => {
    expect(isRuleLocked(settingsWith(["ada|lovelace"]), ruleFor("ada|lovelace"))).toBe(true);
  });

  it("leaves another person's rule editable", () => {
    expect(isRuleLocked(settingsWith(["ada|lovelace"]), ruleFor("grace|hopper"))).toBe(false);
  });
});

describe("lockedPersonKeys", () => {
  it("returns an empty set when nothing is locked", () => {
    expect(lockedPersonKeys(settingsWith(undefined)).size).toBe(0);
  });

  it("returns every locked key", () => {
    const keys = lockedPersonKeys(settingsWith(["ada|lovelace", "grace|hopper"]));
    expect(keys.has("ada|lovelace")).toBe(true);
    expect(keys.has("grace|hopper")).toBe(true);
    expect(keys.size).toBe(2);
  });
});
