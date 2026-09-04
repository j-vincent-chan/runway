import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

/**
 * Guards the design system's colour rules, which are stated in
 * docs/design-system.md but were only ever enforced by eye:
 *
 *   "Never define a color only inside a media query or theme block. Full light
 *    palette on bare :root; redefine tokens under @media (prefers-color-scheme:
 *    dark) guarded so an explicit light setting wins; redefine again for an
 *    explicit dark setting."
 *
 * The two dark blocks are hand-duplicated, so they drift silently — one edit
 * landed in the media query and not in [data-theme="dark"], which would have
 * shipped a theme that only half-applied for anyone who set the theme
 * explicitly. That is the same class of bug as the original report.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Tokens that describe a ground which is dark in BOTH themes, so they never flip. */
const THEME_INVARIANT = new Set(["--navy", "--teal", "--on-brand", "--on-brand-muted"]);

function tokensIn(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of source.matchAll(
    /(--[a-z0-9-]+|color-scheme)\s*:\s*([^;]+);/g
  )) {
    // @theme inline only re-exports tokens to Tailwind; it defines no colours.
    if (!name.startsWith("--color-")) out[name] = value.trim();
  }
  return out;
}

function block(pattern: RegExp): Record<string, string> {
  const m = CSS.match(pattern);
  if (!m?.[1]) throw new Error(`theme block not found: ${pattern}`);
  return tokensIn(m[1]);
}

const root = block(/:root \{([\s\S]*?)\n\}/);
const media = block(
  /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n {2}\}/
);
const explicit = block(/\[data-theme="dark"\] \{([\s\S]*?)\n\}/);

describe("theme tokens", () => {
  it("declares color-scheme in every theme block", () => {
    expect(root["color-scheme"]).toBe("light");
    expect(media["color-scheme"]).toBe("dark");
    expect(explicit["color-scheme"]).toBe("dark");
    expect(CSS).toMatch(/\[data-theme="light"\] \{\s*color-scheme: light;/);
  });

  it("keeps the two dark blocks byte-identical in what they define", () => {
    const drop = (o: Record<string, string>) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => k !== "color-scheme"));
    expect(drop(media)).toEqual(drop(explicit));
  });

  it("redefines every themeable root token in dark", () => {
    const missing = Object.keys(root).filter(
      (t) => t.startsWith("--") && !THEME_INVARIANT.has(t) && !(t in media)
    );
    expect(missing).toEqual([]);
  });

  it("defines no colour only inside a media or theme block", () => {
    const orphans = [...Object.keys(media), ...Object.keys(explicit)].filter(
      (t) => t.startsWith("--") && !(t in root)
    );
    expect(orphans).toEqual([]);
  });

  it("uses no raw Tailwind palette class outside the theme-invariant grounds", () => {
    /*
     * A raw palette class does not flip, so on a dark ground it renders
     * light-on-light — the original defect. The only legitimate uses are on
     * --brand-ground (navy in both themes) and modal scrims, both of which are
     * dark whatever the theme, so a literal white or black is correct there.
     */
    const ALLOWED = new Set([
      "text-white",
      "text-white/70",
      "border-white/10",
      "bg-white/[0.06]",
      "bg-white/[0.07]",
      "bg-black/30",
      "bg-black/40",
    ]);
    const PALETTE =
      /\b(?:[a-z-]+:)*(?:bg|text|border|ring|divide|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/(?:\[[^\]]+\]|\d+))?(?![\w-])/g;

    const offenders: string[] = [];
    for (const file of tsxFiles(join(process.cwd(), "src"))) {
      for (const m of readFileSync(file, "utf8").matchAll(PALETTE)) {
        // Variants (hover:, focus-visible:, md:…) do not change which colour
        // is named, so the allowlist is keyed on the bare utility.
        const bare = m[0].replace(/^(?:[a-z-]+:)+/, "");
        if (!ALLOWED.has(bare)) {
          offenders.push(`${file.split("/src/")[1]}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("pairs every saturated fill with an on-fill foreground", () => {
    for (const fill of ["accent", "caution", "critical", "healthy"]) {
      expect(root[`--${fill}`]).toBeDefined();
      expect(root[`--on-${fill}`]).toBeDefined();
      expect(media[`--on-${fill}`]).toBeDefined();
    }
  });
});
