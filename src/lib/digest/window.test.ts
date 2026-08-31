import { describe, expect, it } from "vitest";
import { digestCutoff, isDueForDigest, nextDigestLabel } from "./window";

// America/Los_Angeles is UTC-7 (PDT) on these August dates.
const TZ = "America/Los_Angeles";

describe("digestCutoff", () => {
  it("returns null before the digest hour", () => {
    // 6:30 AM PDT = 13:30 UTC
    expect(digestCutoff(new Date("2026-08-31T13:30:00Z"), TZ, 8)).toBeNull();
  });

  it("returns this morning's 8:00 local once the hour has passed", () => {
    // 9:15 AM PDT = 16:15 UTC → cutoff 8:00 AM PDT = 15:00 UTC
    const cutoff = digestCutoff(new Date("2026-08-31T16:15:00Z"), TZ, 8);
    expect(cutoff?.toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });

  it("returns the cutoff exactly at the hour", () => {
    const cutoff = digestCutoff(new Date("2026-08-31T15:00:00Z"), TZ, 8);
    expect(cutoff?.toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });

  it("respects a different hour", () => {
    // 9:15 AM PDT with a 10:00 digest hour → not yet
    expect(digestCutoff(new Date("2026-08-31T16:15:00Z"), TZ, 10)).toBeNull();
  });
});

describe("isDueForDigest", () => {
  const nineFifteen = new Date("2026-08-31T16:15:00Z"); // 9:15 AM PDT

  it("ships an item queued yesterday evening", () => {
    // 5:00 PM PDT the previous day
    expect(isDueForDigest("2026-08-31T00:00:00Z", nineFifteen, TZ, 8)).toBe(true);
  });

  it("ships an item queued at 7:59 this morning", () => {
    // 7:59 AM PDT = 14:59 UTC
    expect(isDueForDigest("2026-08-31T14:59:00Z", nineFifteen, TZ, 8)).toBe(true);
  });

  it("holds an item queued at 8:30 this morning for tomorrow", () => {
    // 8:30 AM PDT = 15:30 UTC — after this morning's cutoff
    expect(isDueForDigest("2026-08-31T15:30:00Z", nineFifteen, TZ, 8)).toBe(false);
  });

  it("holds everything before the digest hour", () => {
    const sixThirty = new Date("2026-08-31T13:30:00Z");
    expect(isDueForDigest("2026-08-30T20:00:00Z", sixThirty, TZ, 8)).toBe(false);
  });

  it("a failed 8 AM send is retried by the 9 AM run", () => {
    // Queued yesterday; still due at 9:15 because queuedAt < today's cutoff.
    expect(isDueForDigest("2026-08-30T22:00:00Z", nineFifteen, TZ, 8)).toBe(true);
  });
});

describe("nextDigestLabel", () => {
  it("says this morning before the hour", () => {
    expect(nextDigestLabel(new Date("2026-08-31T13:30:00Z"), TZ, 8)).toBe(
      "this morning at 8:00 AM"
    );
  });

  it("says tomorrow after the hour", () => {
    expect(nextDigestLabel(new Date("2026-08-31T16:15:00Z"), TZ, 8)).toBe(
      "tomorrow at 8:00 AM"
    );
  });
});
