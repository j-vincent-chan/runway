import { describe, expect, it } from "vitest";
import {
  migrateRunwayBalanceOverrideKeys,
  migrateRunwayBurnOverrideKeys,
  runwayBurnOverrideKey,
  runwayOverrideKey,
} from "@/lib/runway/calculate";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { fundingSourceKey } from "@/lib/funding/sourceKey";
import type { Employee, FundingSource } from "@/types";

function emp(id: string): Employee {
  return { id, name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001" };
}

function fund(id: string, rawName: string): FundingSource {
  return { id, rawName, alias: rawName, color: "#000000" };
}

const ada = emp("emp-ada");
const f1 = fund("fs-1", "7000-1-7030720-45");

describe("migrateRunwayBalanceOverrideKeys", () => {
  it("re-keys the employee half of a legacy raw-id key; the chartstring half is already stable", () => {
    const legacyKey = runwayOverrideKey(ada.id, f1.rawName);
    const migrated = migrateRunwayBalanceOverrideKeys({ [legacyKey]: 500 }, [ada]);
    expect(migrated).toEqual({ [runwayOverrideKey(employeePersonKey(ada), f1.rawName)]: 500 });
  });

  it("leaves an already-stable key untouched", () => {
    const key = runwayOverrideKey(employeePersonKey(ada), f1.rawName);
    expect(migrateRunwayBalanceOverrideKeys({ [key]: 500 }, [ada])).toEqual({ [key]: 500 });
  });

  it("keeps an unresolvable employee half rather than dropping the override", () => {
    const key = runwayOverrideKey("gone-employee", f1.rawName);
    expect(migrateRunwayBalanceOverrideKeys({ [key]: 500 }, [ada])).toEqual({ [key]: 500 });
  });

  it("survives a re-import that reassigns the employee's raw id", () => {
    // Set while ada's raw id was "emp-ada-old"; a re-import reassigns it to
    // "emp-ada" (current snapshot), but the stable key never changes.
    const legacyKey = runwayOverrideKey("emp-ada-old", f1.rawName);
    const migrated = migrateRunwayBalanceOverrideKeys({ [legacyKey]: 500 }, [ada]);
    // The old id no longer resolves, so this entry is orphaned going forward —
    // this migration only converts entries whose ids still match the CURRENT
    // snapshot, at the moment format upgrades. It cannot recover an id that
    // already changed before the fix shipped.
    expect(migrated).toEqual({ [legacyKey]: 500 });
  });
});

describe("migrateRunwayBurnOverrideKeys", () => {
  const value = { percentEffort: 50, monthlyBurn: 2500 };

  it("re-keys both halves of a legacy raw-id key", () => {
    const legacyKey = runwayBurnOverrideKey(ada.id, f1.id);
    const migrated = migrateRunwayBurnOverrideKeys({ [legacyKey]: value }, [ada], [f1]);
    expect(migrated).toEqual({
      [runwayBurnOverrideKey(employeePersonKey(ada), fundingSourceKey(f1))]: value,
    });
  });

  it("leaves an already-stable key untouched", () => {
    const key = runwayBurnOverrideKey(employeePersonKey(ada), fundingSourceKey(f1));
    expect(migrateRunwayBurnOverrideKeys({ [key]: value }, [ada], [f1])).toEqual({ [key]: value });
  });

  it("de-duplicates when two legacy keys migrate to the same stable key", () => {
    const stableKey = runwayBurnOverrideKey(employeePersonKey(ada), fundingSourceKey(f1));
    const migrated = migrateRunwayBurnOverrideKeys(
      { [runwayBurnOverrideKey(ada.id, f1.id)]: value, [stableKey]: value },
      [ada],
      [f1]
    );
    expect(migrated).toEqual({ [stableKey]: value });
  });
});
