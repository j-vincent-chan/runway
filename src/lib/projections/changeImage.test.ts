import { describe, expect, it } from "vitest";
import type { ChangeRequestDetails } from "@/lib/projections/changeSummary";
import { renderChangeSummarySvg } from "@/lib/projections/changeImage";

function details(lines: ChangeRequestDetails["lines"]): ChangeRequestDetails {
  return {
    version: 1,
    personKey: "hr:1001",
    personName: "Ada Lovelace",
    capturedAt: "2026-08-15T12:00:00.000Z",
    rules: [],
    lines,
  };
}

const line = {
  chartstringKey: "7000-1-7030720-45",
  accountLabel: "Grant A",
  months: [
    {
      month: "2026-10",
      beforePercent: 100,
      afterPercent: 50,
      beforeMonthlyBurn: 10000,
      afterMonthlyBurn: 5000,
    },
    {
      month: "2026-11",
      beforePercent: 100,
      afterPercent: 50,
      beforeMonthlyBurn: 10000,
      afterMonthlyBurn: 5000,
    },
  ],
};

describe("renderChangeSummarySvg", () => {
  it("is a well-formed standalone SVG with the person and account named", () => {
    const { svg, width, height } = renderChangeSummarySvg(details([line]));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("Ada Lovelace");
    expect(svg).toContain("Grant A");
    expect(svg).toContain("Oct 2026");
    expect(svg).toContain("captured 2026-08-15");
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it("shows before → after percents in each changed cell", () => {
    const { svg } = renderChangeSummarySvg(details([line]));
    expect(svg).toContain("100% →");
    expect(svg).toContain(">50%<");
  });

  it("hatches every cell as projected", () => {
    const { svg } = renderChangeSummarySvg(details([line]));
    expect(svg).toContain('id="proj-hatch"');
    expect(svg).toContain('fill="url(#proj-hatch)"');
    expect(svg).toContain("projected months");
  });

  it("renders one label row per line", () => {
    const second = { ...line, chartstringKey: "planned:p1", accountLabel: "New R01" };
    const { svg } = renderChangeSummarySvg(details([line, second]));
    expect(svg).toContain("Grant A");
    expect(svg).toContain("New R01");
  });

  it("escapes markup-significant characters in labels", () => {
    const hostile = { ...line, accountLabel: 'A & B <"grant">' };
    const { svg } = renderChangeSummarySvg(details([hostile]));
    expect(svg).toContain("A &amp; B &lt;&quot;grant&quot;&gt;");
    expect(svg).not.toContain('<"grant">');
  });

  it("renders a placard when no changes were captured", () => {
    const { svg } = renderChangeSummarySvg(details([]));
    expect(svg).toContain("No distribution changes captured");
    expect(svg).toContain("Ada Lovelace");
  });
});
