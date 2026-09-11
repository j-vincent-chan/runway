import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "./csv";

describe("csvField", () => {
  it("leaves plain values bare", () => {
    expect(csvField("4400")).toBe("4400");
    expect(csvField("Fund 4400 · 144880A")).toBe("Fund 4400 · 144880A");
  });

  it("quotes commas, quotes and line breaks, doubling embedded quotes", () => {
    expect(csvField("24-41571: A Randomized, Double")).toBe('"24-41571: A Randomized, Double"');
    expect(csvField('Said "hello"')).toBe('"Said ""hello"""');
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("quotes values with leading or trailing space so they survive a round trip", () => {
    expect(csvField(" padded ")).toBe('" padded "');
  });
});

describe("toCsv", () => {
  it("writes a BOM, the header, then one CRLF-terminated line per row", () => {
    const csv = toCsv(["A", "B"], [["1", "2"], ["x, y", "z"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('A,B\r\n1,2\r\n"x, y",z\r\n');
  });

  it("emits just the header when there are no rows", () => {
    expect(toCsv(["A"], []).slice(1)).toBe("A\r\n");
  });
});
