import type { DelegationGrant } from "@/lib/supabase/delegates";
import {
  type DelegationRequest,
} from "@/lib/supabase/delegationRequests";

/**
 * The workspace-selection view of an analyst's requests. Grants are the
 * truth for access — an approved request row whose grant has since been
 * deleted means the PI revoked it, so it surfaces as "access removed"
 * rather than silently reading as approved forever.
 */
export type AnalystRequestBuckets = {
  /** Requests still waiting on the PI. */
  pending: DelegationRequest[];
  /** Requests the PI declined, newest first, latest row per PI. */
  declined: DelegationRequest[];
  /** Approved requests whose grant no longer exists — access was revoked. */
  revoked: DelegationRequest[];
};

function matchesGrant(request: DelegationRequest, grants: DelegationGrant[]): boolean {
  return grants.some(
    (g) =>
      (request.piUserId && g.piUserId === request.piUserId) ||
      g.piEmail.toLowerCase() === request.piEmail.trim().toLowerCase()
  );
}

export function partitionAnalystRequests(
  requests: DelegationRequest[],
  grants: DelegationGrant[]
): AnalystRequestBuckets {
  const pending = requests.filter((r) => r.status === "pending");
  const pendingEmails = new Set(pending.map((r) => r.piEmail.trim().toLowerCase()));

  // Closed rows are noise once the same PI has a live grant (access exists)
  // or a newer pending request (the analyst already re-asked); keep only the
  // newest closed row per PI so re-request history doesn't stack up.
  const seen = new Set<string>();
  const declined: DelegationRequest[] = [];
  const revoked: DelegationRequest[] = [];
  for (const request of requests) {
    if (request.status === "pending") continue;
    const key = request.piEmail.trim().toLowerCase();
    if (pendingEmails.has(key) || seen.has(key) || matchesGrant(request, grants)) continue;
    seen.add(key);
    if (request.status === "declined") declined.push(request);
    else revoked.push(request);
  }
  return { pending, declined, revoked };
}
