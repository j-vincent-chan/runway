import { describe, expect, it } from "vitest";
import { emailFrom, emailParagraph, renderEmail } from "./layout";
import { escapeHtml } from "./html";

const base = {
  preheader: "A change is waiting for you.",
  bodyHtml: emailParagraph("Something happened."),
  receivingReason: "You're receiving this because of a test.",
};

describe("renderEmail", () => {
  it("produces a complete standalone document", () => {
    const { html } = renderEmail(base);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('lang="en"');
    expect(html).toContain('name="color-scheme" content="light"');
  });

  it("hides the preheader but includes its text", () => {
    const { html } = renderEmail(base);
    expect(html).toContain("A change is waiting for you.");
    expect(html).toContain("display:none");
  });

  it("renders the CTA as the only body anchor, with the given absolute href", () => {
    const { html } = renderEmail({
      ...base,
      cta: { label: "Open Runway", url: "https://runway.example.org/status" },
    });
    expect(html).toContain('href="https://runway.example.org/status"');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain("Open Runway");
  });

  it("rejects a relative CTA url", () => {
    expect(() =>
      renderEmail({ ...base, cta: { label: "Open", url: "runway.example.org/settings" } })
    ).toThrow(/absolute/);
  });

  it("omits greeting and footnote when absent, includes them when present", () => {
    const bare = renderEmail(base).html;
    expect(bare).not.toContain("Hi ");
    const full = renderEmail({
      ...base,
      greeting: "Hi Priya,",
      footnoteHtml: "Figures are planning estimates.",
    }).html;
    expect(full).toContain("Hi Priya,");
    expect(full).toContain("Figures are planning estimates.");
  });

  it("escapes the receiving reason and greeting", () => {
    const { html } = renderEmail({
      ...base,
      greeting: "Hi <b>X</b>,",
      receivingReason: 'because <script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Hi <b>");
  });

  it("uses no images and none of the deprecated muted color", () => {
    const { html } = renderEmail(base);
    expect(html).not.toContain("<img");
    expect(html.toLowerCase()).not.toContain("6b7690");
  });

  it("always carries the planning-layer footer", () => {
    const { html } = renderEmail(base);
    expect(html).toContain("not the payroll system of record");
  });
});

describe("emailFrom", () => {
  it("wraps the address with the product display name", () => {
    expect(emailFrom(" runway@example.org ")).toBe("Runway <runway@example.org>");
  });
});

describe("escapeHtml", () => {
  it("escapes all five entities", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
