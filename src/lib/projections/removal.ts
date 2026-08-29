import type {
  AppSettings,
  PayrollReportSnapshot,
  WorkingPlan,
} from "@/types";
import { getAllocations } from "@/lib/calculations";
import { fundingSourceKey } from "@/lib/funding/sourceKey";

/**
 * Removing a chartstring from a person's Projections list is a per-person
 * detach, never a global delete. The person→chartstring pairing is derived
 * (allocations ∪ rules), so removal means deleting the rules that create it —
 * and is impossible when imported payroll is why the row exists, because a
 * report row is a fact, not a plan.
 */
export type ChartstringRemovalCheck =
  | {
      removable: true;
      ruleIdsToDelete: string[];
      /** This person's other rules whose moveTo remainder targets the removed key. */
      remainderRuleIdsToRepair: string[];
      /** Planned source to drop, only when nothing else references it. */
      removePlannedSourceId: string | null;
    }
  | {
      removable: false;
      reason: "importedAllocations";
      allocationCount: number;
      /** Sorted unique yyyy-MM months the imported pairing covers. */
      months: string[];
    };

export function checkChartstringRemoval(input: {
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  settings: AppSettings;
  employeeId: string;
  personKey: string;
  chartstringKey: string;
}): ChartstringRemovalCheck {
  const { snapshot, workingPlan, settings, employeeId, personKey, chartstringKey } = input;

  // Allocations reference per-import funding source ids; the removal key is
  // the stable chartstring key. Bridge via the snapshot's source list.
  if (snapshot) {
    const matchingIds = new Set(
      snapshot.fundingSources
        .filter((fs) => fundingSourceKey(fs) === chartstringKey)
        .map((fs) => fs.id)
    );
    if (matchingIds.size > 0) {
      const rows = getAllocations(snapshot, workingPlan).filter(
        (a) => a.employeeId === employeeId && matchingIds.has(a.fundingSourceId)
      );
      if (rows.length > 0) {
        return {
          removable: false,
          reason: "importedAllocations",
          allocationCount: rows.length,
          months: [...new Set(rows.map((a) => a.month))].sort(),
        };
      }
    }
  }

  const rules = settings.projectionRules ?? [];
  const ruleIdsToDelete = rules
    .filter((r) => r.personKey === personKey && r.chartstringKey === chartstringKey)
    .map((r) => r.id);
  const remainderRuleIdsToRepair = rules
    .filter(
      (r) =>
        r.personKey === personKey &&
        r.chartstringKey !== chartstringKey &&
        r.remainder.kind === "moveTo" &&
        r.remainder.chartstringKey === chartstringKey
    )
    .map((r) => r.id);

  return {
    removable: true,
    ruleIdsToDelete,
    remainderRuleIdsToRepair,
    removePlannedSourceId: orphanedPlannedSourceId(input, ruleIdsToDelete, remainderRuleIdsToRepair),
  };
}

/**
 * A planned source is deletable only when this removal leaves it with no
 * referents at all: no payroll source shares its key, and no surviving rule
 * (any person's) targets it directly or as a moveTo destination.
 */
function orphanedPlannedSourceId(
  input: {
    snapshot: PayrollReportSnapshot | null;
    settings: AppSettings;
    chartstringKey: string;
  },
  ruleIdsToDelete: string[],
  remainderRuleIdsToRepair: string[]
): string | null {
  const { snapshot, settings, chartstringKey } = input;
  const planned = (settings.plannedFundingSources ?? []).find(
    (p) => p.chartstringKey === chartstringKey
  );
  if (!planned) return null;
  if (snapshot?.fundingSources.some((fs) => fundingSourceKey(fs) === chartstringKey)) {
    return null;
  }
  const deleted = new Set(ruleIdsToDelete);
  const repaired = new Set(remainderRuleIdsToRepair);
  const stillReferenced = (settings.projectionRules ?? []).some((r) => {
    if (deleted.has(r.id)) return false;
    if (r.chartstringKey === chartstringKey) return true;
    return (
      !repaired.has(r.id) &&
      r.remainder.kind === "moveTo" &&
      r.remainder.chartstringKey === chartstringKey
    );
  });
  return stillReferenced ? null : planned.id;
}

export function applyChartstringRemoval(
  settings: AppSettings,
  check: Extract<ChartstringRemovalCheck, { removable: true }>
): AppSettings {
  const toDelete = new Set(check.ruleIdsToDelete);
  const toRepair = new Set(check.remainderRuleIdsToRepair);
  const projectionRules = (settings.projectionRules ?? [])
    .filter((r) => !toDelete.has(r.id))
    .map((r) => (toRepair.has(r.id) ? { ...r, remainder: { kind: "uncovered" as const } } : r));
  const plannedFundingSources = check.removePlannedSourceId
    ? (settings.plannedFundingSources ?? []).filter((p) => p.id !== check.removePlannedSourceId)
    : settings.plannedFundingSources;
  return { ...settings, projectionRules, plannedFundingSources };
}
