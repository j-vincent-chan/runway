import { describe, expect, it } from "vitest";
import { composeLockInEmail } from "./composeLockIn";

const APP = "https://runway.example.org";

const base = {
  requestedBy: "vincent.chan@ucsf.edu",
  personName: "Ada Lovelace",
  sentences: ["Admin Enrichment (#128070): 75% → 50% from Sep 2026"],
  appUrl: APP,
};

describe("composeLockInEmail", () => {
  it("subjects with the person's name", () => {
    expect(composeLockInEmail(base).subject).toBe("Distribution change for Ada Lovelace");
  });

  it("carries every change sentence in both parts", () => {
    const { html, text } = composeLockInEmail(base);
    expect(html).toContain("75% → 50% from Sep 2026");
    expect(text).toContain("75% → 50% from Sep 2026");
  });

  it("keeps the empty-diff fallback line", () => {
    const { html } = composeLockInEmail({ ...base, sentences: [] });
    expect(html).toContain("The captured plan matched the current distribution");
  });

  it("links to the Status page with an absolute URL", () => {
    const { html, text } = composeLockInEmail(base);
    expect(html).toContain(`href="${APP}/status"`);
    expect(text).toContain(`${APP}/status`);
  });

  it("always carries the planning-figures caveat", () => {
    const { html, text } = composeLockInEmail(base);
    const caveat = "not payroll system of record data — confirm before entry";
    expect(html).toContain(caveat);
    expect(text).toContain(caveat);
  });

  it("escapes interpolated names", () => {
    const { html } = composeLockInEmail({ ...base, personName: "<b>X</b>" });
    expect(html).not.toContain("<b>X</b>");
  });
});
