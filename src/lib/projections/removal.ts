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
 * (allocations ∪ rules), so removal means deleting the rules that create it.
 *
 * It is refused only while the account is part of the person's *current*
 * distribution — payroll charging them from the origin month forward. An
 * account they came off a year ago is history, not a plan: Projections is
 * about what happens next, so the row comes off the list there while every
 * past month stays exactly as imported. Removal only ever edits
 * `projectionRules` and `plannedFundingSources`; allocations are never
 * touched, so Distribution History is unaffected either way.
 */
export type ChartstringRemovalCheck =
  | {
      removable: true;
      ruleIdsToDelete: string[];
      /** This person's other rules whose moveTo remainder targets the removed key. */
      remainderRuleIdsToRepair: string[];
      /** Planned source to drop, only when nothing else references it. */
      removePlannedSourceId: string | null;
      /** Past months the pairing covers — kept intact, worth saying so. */
      historicalMonths: string[];
    }
  | {
      removable: false;
      reason: "importedAllocations";
      allocationCount: number;
      /** Sorted unique yyyy-MM months from the origin month forward. */
      months: string[];
    };

export function checkChartstringRemoval(input: {
  snapshot: PayrollReportSnapshot | null;
  workingPlan: WorkingPlan | null;
  settings: AppSettings;
  employeeId: string;
  personKey: string;
  chartstringKey: string;
  /**
   * The projection's origin month (yyyy-MM) — the boundary between history and
   * the current distribution. Comes from `simulateProjections`, never
   * recomputed here.
   */
  originMonth: string;
}): ChartstringRemovalCheck {
  const { snapshot, workingPlan, settings, employeeId, personKey, chartstringKey, originMonth } =
    input;

  // Allocations reference per-import funding source ids; the removal key is
  // the stable chartstring key. Bridge via the snapshot's source list.
  const historicalMonths: string[] = [];
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
      // yyyy-MM sorts lexicographically, so a string compare is the month compare.
      const current = rows.filter((a) => a.month >= originMonth);
      if (current.length > 0) {
        return {
          removable: false,
          reason: "importedAllocations",
          allocationCount: current.length,
          months: [...new Set(current.map((a) => a.month))].sort(),
        };
      }
      historicalMonths.push(...new Set(rows.map((a) => a.month)));
      historicalMonths.sort();
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
    historicalMonths,
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
