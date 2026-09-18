import type { AppSettings, ReconciliationEvent, ReconciliationEventType } from "@/types";
import { generateId } from "@/lib/utils/parse";

/** Recorded when nobody is signed in; rendered as "(signed out)". */
export const LOCAL_ACTOR = "local";

export function makeEvent(
  type: ReconciliationEventType,
  summary: string,
  by: string,
  extra: Partial<Pick<ReconciliationEvent, "linkId" | "plannedHireId" | "detail">> = {},
  at: string = new Date().toISOString()
): ReconciliationEvent {
  return { id: generateId(), at, by: by || LOCAL_ACTOR, type, summary, ...extra };
}

/** The log is append-only; nothing here ever removes or rewrites a row. */
export function appendEvents(settings: AppSettings, events: ReconciliationEvent[]): AppSettings {
  if (events.length === 0) return settings;
  return {
    ...settings,
    reconciliationEvents: [...(settings.reconciliationEvents ?? []), ...events],
  };
}

/** An event's ISO timestamp as the local calendar day — "Sep 16, 2026". */
export function formatEventDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "by vincent.chan@ucsf.edu", or "(signed out)" for a local-only action. */
export function actorLabel(by: string | undefined): string {
  return !by || by === LOCAL_ACTOR ? "(signed out)" : `by ${by}`;
}
