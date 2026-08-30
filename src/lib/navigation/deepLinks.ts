/**
 * Deep links from the Dashboard's attention queue to the surface where the
 * named entity can actually be acted on.
 *
 * Both halves live here — the builder the queue uses and the param name the
 * destination reads — because a row whose verb and destination disagree is the
 * defect this module exists to prevent. "Reassign" pointed at Runway, where
 * nobody can be reassigned; reassignment is a Projections rule.
 */

/** Query param each destination reads to preselect an entity. */
export const DEEP_LINK_PARAM = {
  /** Account chart root (fund-dept-project) on Runway and Account Balances. */
  account: "account",
  /** `employeePersonKey` on Projections. */
  person: "person",
  /** Settings panel id, plus the team whose accounts need categorizing. */
  panel: "panel",
  team: "team",
} as const;

/** Review an account's runway — Runway lists per-account months remaining. */
export function runwayAccountHref(chartRoot: string): string {
  return `/runway?${DEEP_LINK_PARAM.account}=${encodeURIComponent(chartRoot)}`;
}

/** Reassign a person's effort — only Projections can change a distribution. */
export function projectionsPersonHref(personKey: string): string {
  return `/projections?${DEEP_LINK_PARAM.person}=${encodeURIComponent(personKey)}`;
}

/** Categorize a team's uncategorized charges — the funding-type catalog. */
export function settingsAccountsHref(teamId?: string): string {
  const base = `/settings?${DEEP_LINK_PARAM.panel}=accounts`;
  return teamId ? `${base}&${DEEP_LINK_PARAM.team}=${encodeURIComponent(teamId)}` : base;
}

/**
 * The DOM id a deep-linked row carries, so the destination can scroll to it
 * and mark it. Shared so the anchor and the lookup can never drift apart.
 */
export function deepLinkAnchorId(kind: "account" | "person", key: string): string {
  // Keys hold characters that are legal in an id but awkward in a selector
  // (dots, spaces, colons), so callers use getElementById, never querySelector.
  return `deeplink-${kind}-${key}`;
}
