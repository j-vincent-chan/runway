/**
 * Email rendering has no CSS variables, no theme switching, and no app
 * stylesheet — every color and font stack is a literal, mirroring the app's
 * light palette (globals.css :root). Same precedent as the change-summary
 * image (src/lib/projections/changeImage.ts): emailed documents render on
 * light, once, for everyone.
 */
export const INK = "#0f1a2b";
export const INK_2 = "#38445c";
/** The app's darkened muted — never #6B7690, which fails 4.5:1 on light. */
export const MUTED = "#636d85";
export const NAVY = "#0c2340";
export const ACCENT = "#12626e";
export const ACCENT_SOFT = "#deebee";
export const PAPER = "#f5f6f9";
export const SURFACE = "#ffffff";
export const RULE = "#dce0e9";

export const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
