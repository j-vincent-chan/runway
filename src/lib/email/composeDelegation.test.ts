import { describe, expect, it } from "vitest";
import {
  composeDelegationApprovedEmail,
  composeDelegationRequestEmail,
} from "./composeDelegation";

const APP = "https://runway.example.org";

describe("composeDelegationRequestEmail", () => {
  const base = {
    analystName: "Priya Patel",
    analystEmail: "priya@uni.edu",
    note: "",
    appUrl: APP,
  };

  it("subjects with the name when present, email otherwise", () => {
    expect(composeDelegationRequestEmail(base).subject).toBe(
      "Priya Patel requests access to your Runway workspace"
    );
    expect(composeDelegationRequestEmail({ ...base, analystName: "" }).subject).toBe(
      "priya@uni.edu requests access to your Runway workspace"
    );
  });

  it("links only to Settings — never an approve action", () => {
    const { html, text } = composeDelegationRequestEmail(base);
    expect(html).toContain(`href="${APP}/settings"`);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(text).toContain(`${APP}/settings`);
    expect(html.toLowerCase()).not.toContain("approve?");
  });

  it("escapes the analyst name and note", () => {
    const { html } = composeDelegationRequestEmail({
      ...base,
      analystName: "<b>X</b>",
      note: 'Click <script>alert("x")</script>',
    });
    expect(html).not.toContain("<b>X</b>");
    expect(html).not.toContain("<script>");
  });

  it("omits the note paragraph when the note is blank", () => {
    expect(composeDelegationRequestEmail(base).html).not.toContain("Their note:");
    expect(
      composeDelegationRequestEmail({ ...base, note: "I handle post-award" }).html
    ).toContain("Their note:");
  });

  it("keeps the security footnote", () => {
    const { html } = composeDelegationRequestEmail(base);
    expect(html).toContain("no access exists until you approve");
  });
});

describe("composeDelegationApprovedEmail", () => {
  const base = { piEmail: "pi@uni.edu", analystName: "Priya Patel", appUrl: APP };

  it("subjects with the PI email", () => {
    expect(composeDelegationApprovedEmail(base).subject).toBe(
      "pi@uni.edu approved your Runway access"
    );
  });

  it("greets by first name when known, not at all otherwise", () => {
    expect(composeDelegationApprovedEmail(base).html).toContain("Hi Priya,");
    expect(composeDelegationApprovedEmail({ ...base, analystName: "" }).html).not.toContain(
      "Hi "
    );
  });

  it("CTA opens the app root with an absolute URL", () => {
    const { html, text } = composeDelegationApprovedEmail(base);
    expect(html).toContain(`href="${APP}"`);
    expect(text).toContain(APP);
  });
});
