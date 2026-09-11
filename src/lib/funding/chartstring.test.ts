import { describe, expect, it } from "vitest";
import { splitChartstring } from "./chartstring";

describe("splitChartstring", () => {
  it("splits a payroll chartstring into its four chartfields", () => {
    expect(splitChartstring("4400-138401-144880A-44")).toEqual({
      fund: "4400",
      dept: "138401",
      project: "144880A",
      activity: "44",
    });
  });

  it("leaves activity blank for an Account Balances fund-dept-project key", () => {
    expect(splitChartstring("4400-138401-144880A")).toEqual({
      fund: "4400",
      dept: "138401",
      project: "144880A",
      activity: "",
    });
  });

  it("preserves source casing rather than the lowercase lookup form", () => {
    expect(splitChartstring("7000-128048-146328D-44").project).toBe("146328D");
  });

  it("tolerates surrounding and interior whitespace", () => {
    expect(splitChartstring("  4400 - 138401 - 144880A - 44 ")).toEqual({
      fund: "4400",
      dept: "138401",
      project: "144880A",
      activity: "44",
    });
  });

  it("yields four blanks for a label-only source", () => {
    expect(splitChartstring("Percent effort other")).toEqual({
      fund: "",
      dept: "",
      project: "",
      activity: "",
    });
    expect(splitChartstring("")).toEqual({ fund: "", dept: "", project: "", activity: "" });
  });

  it("ignores segments beyond the fourth", () => {
    expect(splitChartstring("4400-138401-144880A-44-EXTRA").activity).toBe("44");
  });
});
