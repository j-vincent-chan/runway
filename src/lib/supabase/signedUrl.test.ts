import { describe, expect, it } from "vitest";
import {
  encodeStorageRef,
  parseStorageRef,
} from "@/lib/supabase/signedUrl";
import { canUseCloudSync } from "@/lib/supabase/cloudGate";

describe("signedUrl refs", () => {
  it("encodes and parses sb:// refs", () => {
    const ref = encodeStorageRef("employee-photos", "hr:1/photo.jpg");
    expect(ref).toBe("sb://employee-photos/hr:1/photo.jpg");
    expect(parseStorageRef(ref)).toEqual({
      bucket: "employee-photos",
      path: "hr:1/photo.jpg",
    });
  });

  it("parses legacy public storage URLs", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/public/employee-offer-letters/hr%3A1/letter.pdf";
    expect(parseStorageRef(url)).toEqual({
      bucket: "employee-offer-letters",
      path: "hr:1/letter.pdf",
    });
  });
});

describe("canUseCloudSync", () => {
  it("requires configured + signed in + not local-only", () => {
    expect(
      canUseCloudSync({ configured: true, signedIn: true, localOnly: false })
    ).toBe(true);
    expect(
      canUseCloudSync({ configured: true, signedIn: false, localOnly: false })
    ).toBe(false);
    expect(
      canUseCloudSync({ configured: true, signedIn: true, localOnly: true })
    ).toBe(false);
    expect(
      canUseCloudSync({ configured: false, signedIn: true, localOnly: false })
    ).toBe(false);
  });
});
