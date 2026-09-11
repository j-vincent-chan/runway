import { describe, expect, it } from "vitest";
import { parseStatusFromWarnings } from "./helpers";
import type { ParseWarning } from "@/types";

const w = (severity: ParseWarning["severity"]): ParseWarning => ({
  id: severity,
  severity,
  message: severity,
});

describe("parseStatusFromWarnings", () => {
  it("is success with no warnings", () => {
    expect(parseStatusFromWarnings([])).toBe("success");
  });

  it("ignores info-level notes", () => {
    expect(parseStatusFromWarnings([w("info"), w("info")])).toBe("success");
  });

  it("is partial on a warning", () => {
    expect(parseStatusFromWarnings([w("info"), w("warning")])).toBe("partial");
  });

  it("is failed on any error, even beside warnings", () => {
    expect(parseStatusFromWarnings([w("warning"), w("error"), w("info")])).toBe("failed");
  });
});
