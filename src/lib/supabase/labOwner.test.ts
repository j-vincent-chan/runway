import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAB_OWNER_EMAIL,
  getLabOwnerEmail,
  isLabOwnerEmail,
} from "@/lib/supabase/labOwner";

describe("lab owner", () => {
  it("defaults to vincent.chan@ucsf.edu", () => {
    expect(getLabOwnerEmail()).toBe(DEFAULT_LAB_OWNER_EMAIL);
    expect(isLabOwnerEmail("vincent.chan@ucsf.edu")).toBe(true);
    expect(isLabOwnerEmail("Vincent.Chan@UCSF.edu")).toBe(true);
  });

  it("rejects other accounts", () => {
    expect(isLabOwnerEmail("other@ucsf.edu")).toBe(false);
    expect(isLabOwnerEmail(null)).toBe(false);
    expect(isLabOwnerEmail("")).toBe(false);
  });
});
