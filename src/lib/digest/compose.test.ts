import { describe, expect, it } from "vitest";
import {
  composeDigestEmail,
  digestSubjectSummary,
  type DigestPiSection,
} from "./compose";

const base: DigestPiSection = {
  piEmail: "vincent.chan@ucsf.edu",
  items: [
    {
      personName: "Reid R Bolus",
      kind: "new",
      sentences: ["Admin Enrichment (#128070): 75% → 50% from Sep 2026"],
    },
    {
      personName: "Ohnmar Chase",
      kind: "updated",
      sentences: ["St. Mary's Hospital: 37.5% → 50% from Nov 2026"],
    },
    { personName: "Vincent Chan", kind: "withdrawn", sentences: [] },
  ],
  backlog: { openCount: 2, oldestSubmitted: "Aug 12, 2026" },
};

describe("digestSubjectSummary", () => {
  it("joins kinds with correct singular/plural", () => {
    expect(digestSubjectSummary([base])).toBe("1 new request, 1 update and 1 withdrawal");
  });

  it("handles a single kind", () => {
    expect(
      digestSubjectSummary([{ ...base, items: base.items.filter((i) => i.kind === "new") }])
    ).toBe("1 new request");
  });

  it("pluralizes", () => {
    const twoNew = {
      ...base,
      items: [base.items[0]!, { ...base.items[0]!, personName: "B" }],
    };
    expect(digestSubjectSummary([twoNew])).toBe("2 new requests");
  });
});

describe("composeDigestEmail", () => {
  const { subject, text, html } = composeDigestEmail([base], "Aug 31, 2026");

  it("names the counts and date in the subject", () => {
    expect(subject).toBe(
      "Runway distribution changes — 1 new request, 1 update and 1 withdrawal (Aug 31, 2026)"
    );
  });

  it("groups by kind with people named, not counted", () => {
    expect(text).toContain("New:");
    expect(text).toContain("Reid R Bolus");
    expect(text).toContain("Updated:");
    expect(text).toContain("Ohnmar Chase");
    expect(text).toContain("Withdrawn — no action needed:");
    expect(text).toContain("Vincent Chan");
  });

  it("carries the change sentences for actionable items only", () => {
    expect(text).toContain("Admin Enrichment (#128070): 75% → 50% from Sep 2026");
    // Withdrawn items list the person but no change detail to act on.
    const withdrawnBlock = text.slice(text.indexOf("Withdrawn"));
    expect(withdrawnBlock).not.toContain("%");
  });

  it("keeps the backlog visible without extra emails", () => {
    expect(text).toContain("2 earlier requests from this PI are still open");
    expect(text).toContain("Aug 12, 2026");
  });

  it("flags a revision that landed while the analyst was working", () => {
    const revised: DigestPiSection = {
      ...base,
      items: [{ ...base.items[1]!, revisedWhileInProgress: true }],
    };
    const out = composeDigestEmail([revised], "Aug 31, 2026");
    expect(out.text).toContain("revised while you had it in progress");
  });

  it("keeps the not-system-of-record caveat", () => {
    expect(text).toContain("not payroll system of record data");
    expect(html).toContain("not payroll system of record data");
  });

  it("escapes HTML in names", () => {
    const sneaky: DigestPiSection = {
      ...base,
      items: [{ personName: "<b>X</b>", kind: "new", sentences: [] }],
    };
    expect(composeDigestEmail([sneaky], "Aug 31, 2026").html).not.toContain("<b>X</b>");
  });
});
