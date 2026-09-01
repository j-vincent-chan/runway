import { describe, expect, it } from "vitest";
import { partitionAnalystRequests } from "./partition";
import type { DelegationGrant } from "@/lib/supabase/delegates";
import type {
  DelegationRequest,
  DelegationRequestStatus,
} from "@/lib/supabase/delegationRequests";

let nextId = 0;
function request(
  piEmail: string,
  status: DelegationRequestStatus,
  overrides: Partial<DelegationRequest> = {}
): DelegationRequest {
  nextId += 1;
  return {
    id: `req-${nextId}`,
    analystUserId: "analyst-1",
    analystEmail: "analyst@uni.edu",
    analystName: "Tester One",
    piEmail,
    piUserId: null,
    status,
    note: "",
    createdAt: "2026-08-01T00:00:00Z",
    respondedAt: status === "pending" ? null : "2026-08-02T00:00:00Z",
    ...overrides,
  };
}

function grant(piEmail: string, piUserId: string): DelegationGrant {
  return { piUserId, piEmail, analystEmail: "analyst@uni.edu", createdAt: "2026-08-02T00:00:00Z" };
}

describe("partitionAnalystRequests", () => {
  it("keeps pending requests as pending", () => {
    const buckets = partitionAnalystRequests([request("pi@uni.edu", "pending")], []);
    expect(buckets.pending).toHaveLength(1);
    expect(buckets.declined).toHaveLength(0);
    expect(buckets.revoked).toHaveLength(0);
  });

  it("hides an approved request that has a live grant", () => {
    const buckets = partitionAnalystRequests(
      [request("pi@uni.edu", "approved", { piUserId: "pi-1" })],
      [grant("pi@uni.edu", "pi-1")]
    );
    expect(buckets.revoked).toHaveLength(0);
  });

  it("surfaces an approved request with no grant as revoked", () => {
    const buckets = partitionAnalystRequests(
      [request("pi@uni.edu", "approved", { piUserId: "pi-1" })],
      []
    );
    expect(buckets.revoked).toHaveLength(1);
  });

  it("matches grants by email case-insensitively when piUserId is unresolved", () => {
    const buckets = partitionAnalystRequests(
      [request("PI@Uni.edu", "approved")],
      [grant("pi@uni.edu", "pi-1")]
    );
    expect(buckets.revoked).toHaveLength(0);
  });

  it("keeps declined requests visible with no grant", () => {
    const buckets = partitionAnalystRequests([request("pi@uni.edu", "declined")], []);
    expect(buckets.declined).toHaveLength(1);
  });

  it("suppresses closed rows for a PI with a newer pending request", () => {
    const buckets = partitionAnalystRequests(
      [request("pi@uni.edu", "pending"), request("pi@uni.edu", "declined")],
      []
    );
    expect(buckets.pending).toHaveLength(1);
    expect(buckets.declined).toHaveLength(0);
  });

  it("keeps only the newest closed row per PI (rows arrive newest first)", () => {
    const buckets = partitionAnalystRequests(
      [request("pi@uni.edu", "declined"), request("pi@uni.edu", "declined")],
      []
    );
    expect(buckets.declined).toHaveLength(1);
    expect(buckets.declined[0].id).toBe(`req-${nextId - 1}`);
  });
});
