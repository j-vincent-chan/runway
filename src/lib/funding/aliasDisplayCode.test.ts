import { describe, expect, it } from "vitest";
import { projectDisplayCode } from "@/lib/funding/alias";
import type { FundingSource } from "@/types";

function fs(id: string, accountString: string): FundingSource {
  return { id, rawName: accountString, alias: "x", accountString, color: "#ccc" };
}

describe("projectDisplayCode", () => {
  it("shows the bare project code when it is unique", () => {
    const a = fs("a", "7000-128048-146328D-44");
    expect(projectDisplayCode(a, [a, fs("b", "7000-128048-9999999-44")])).toBe("146328D");
  });

  it("appends the dept when two accounts share a project code across depts", () => {
    const a = fs("a", "7000-128048-146328D-44");
    const b = fs("b", "7000-128070-146328D-44");
    expect(projectDisplayCode(a, [a, b])).toBe("146328D · dept 128048");
    expect(projectDisplayCode(b, [a, b])).toBe("146328D · dept 128070");
  });

  it("keeps the bare code when the same project repeats within one dept", () => {
    // Same fund-dept-project, different activity segment — not ambiguous.
    const a = fs("a", "7000-128048-146328D-44");
    const b = fs("b", "7000-128048-146328D-45");
    expect(projectDisplayCode(a, [a, b])).toBe("146328D");
  });

  it("falls back to the bare code without a sources list", () => {
    expect(projectDisplayCode(fs("a", "7000-128048-146328D-44"))).toBe("146328D");
  });
});
