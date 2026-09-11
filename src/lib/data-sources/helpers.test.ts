import { describe, expect, it } from "vitest";
import { formatFileNameList, parseStatusFromWarnings } from "./helpers";
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

describe("formatFileNameList", () => {
  it("returns a single name as is", () => {
    expect(formatFileNameList(["a.xlsx"])).toBe("a.xlsx");
  });

  it("joins two names with and", () => {
    expect(formatFileNameList(["a.xlsx", "b.xlsx"])).toBe("a.xlsx and b.xlsx");
  });

  it("uses a serial comma for three or more", () => {
    expect(formatFileNameList(["a.xlsx", "b.xlsx", "c.xlsx"])).toBe("a.xlsx, b.xlsx, and c.xlsx");
  });
});
