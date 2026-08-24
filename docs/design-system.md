# Runway design system

Durable UI rules for Runway. These apply to every surface, not just the Dashboard. When a request conflicts with a rule here, say so before proceeding.

Rationale for these choices lives in the Dashboard design review: https://claude.ai/code/artifact/5f14bd06-2bad-4b82-b17e-fef6ad79831a

## Governing objective

Runway exists to reduce the time and cognitive effort required for a faculty member to understand the financial state of their research program and identify anything requiring attention. Every UI decision serves that. Visual polish is in service of it, never a substitute for it.

The audience is a UCSF principal investigator, not a financial analyst. They open Runway between clinic and a lab meeting, a handful of times a year. Optimize for the ten-second read, not for the power user.

## Color

Nearly all color goes to one accent. Three semantics are reserved and never used decoratively.

```
Light
--ink            #0F1A2B   text, rules, emphasis
--ink-2          #38445C   secondary text
--muted          #6B7690   labels, captions
--paper          #F5F6F9   page ground
--surface        #FFFFFF   raised blocks
--inset          #F9FAFC   table headers, quiet fills
--rule           #DCE0E9   hairlines
--rule-strong    #BFC6D4   emphasized hairlines, axis lines
--accent         #12626E   ALL measured/actual data
--caution        #8F620F   3–6 month horizon
--critical       #95382B   overdrawn, or under 3 months
--healthy        #2C6B4E   confirmed-good only
--accent-soft    #DEEBEE
--caution-soft   #F5EEDC
--critical-soft  #F6E6E3
--healthy-soft   #E1EDE6

Dark
--ink #E7EBF2 · --ink-2 #B6BFCE · --muted #8794AA · --paper #0C111A
--surface #131A26 · --inset #101724 · --rule #242E3E · --rule-strong #374359
--accent #5FB8C2 · --caution #D5A241 · --critical #E08C78 · --healthy #71B995
--accent-soft #11313A · --caution-soft #312611 · --critical-soft #37201B · --healthy-soft #152A21
```

Rules:

- `--caution`, `--critical`, `--healthy` mean state. Never decorative, never a brand accent.
- `--healthy` appears only on confirmed-good states, so green keeps its meaning.
- **Projected data is never a different hue.** Always the same hue as actual at 45% opacity, plus a 45° diagonal hatch and a dotted stroke. One convention, used identically everywhere.
- **Unattributed / uncategorized money renders as hatched grey** so it reads as a hole, not a category.
- Personnel groups get no color assignment. They are table rows.
- Categorical color is permitted in exactly one place: the funding-exposure band. Cap at five named sources plus "other", ordered identically in every period.
- Never define a color only inside a media query or theme block. Full light palette on bare `:root`; redefine tokens under `@media (prefers-color-scheme: dark)` guarded so an explicit light setting wins; redefine again for an explicit dark setting.

## Type

Interface sans with true tabular figures, plus one monospace for data furniture — labels, axis ticks, account codes, timestamps, deltas. The mono is what makes Runway read as an instrument rather than a document.

```
40 / 44   verdict sentence     weight 500, tracking -0.02em
26 / 32   stat values          weight 500, tabular-nums
20 / 28   section headings     weight 600
16 / 24   body
14 / 20   table and row text
11.5      mono labels, metadata
10.5      uppercase captions   tracking 0.11em
```

Seven steps. Do not improvise an eighth.

- All numerals use `font-variant-numeric: tabular-nums`, right-aligned in columns.
- Thousands separated. No decimals on dollars above $1,000.
- **Every figure is larger than its own label.** No exceptions.

## Layout

- 12 columns, 24px gutters, 8px spacing base.
- **Sections are separated by whitespace and a hairline rule, not by cards.** Card chrome is reserved for discrete objects: one person, one account, one alert row.
- Never nest containers more than one deep.
- Density climbs down the page: sparse summary at top, dense tables below.
- No gradients, no glassmorphism, no decorative rounding, no emoji, no drop shadows beyond a hairline border.

## Charts

- **No dual-axis charts, ever.** If two series need different scales, they need two charts or one of them is a stat.
- No donut or pie charts. Share-of-total is a stacked bar; share-over-time is a stacked band.
- Prefer direct end-labelling over legends. Use a legend only when direct labelling is impossible.
- Minimum chart furniture: no vertical gridlines, at most four horizontal reference lines, axis labels in mono at 11px.
- Annotate anomalies inline rather than leaving spikes unexplained.
- Never truncate a value axis in a way that exaggerates a small change.
- Sparklines get the same care as full charts: faint fill, emphasized endpoint, no axes, no gridlines.
- Deltas are colored only when they carry state meaning. A falling burn rate is not automatically good.

## Trust and projections

Projections drive hiring decisions. The seams must show.

- Every projected figure is prefixed `~`, carries a dotted underline, and reveals its derivation in plain language on hover or focus.
- Projected data is distinguished by **pattern as well as opacity**, so it survives greyscale and color-vision deficiency.
- Never render a projected figure so it could be mistaken for a measured one.
- Always state a period's closure status. An in-progress period is labelled as such and treated as provisional everywhere.
- Every delta states its comparison basis in words. Because data arrives by upload, the honest baseline is the previous report, named and dated — not "YoY".
- Never compare periods of unequal length as if they were peers.
- Preserve the provenance line: filename, exact import timestamp, sync state.
- Preserve the post-award disclaimer. Show it once, unobstructed. No floating element may overlap it.
- Financial calculations are never reimplemented or guessed. Reuse the canonical selector. If one does not exist, stop and ask.

## Copy

- Write from the faculty member's side of the screen. Active voice. A control says exactly what happens.
- **Never show a count where a name is available.** "2 personnel require attention" is a defect; naming both people is the fix.
- Templated strings only for anything derived from data. No free-form generated prose in the product.
- Handle singular, plural, and zero in every templated sentence. Never emit "and 0 accounts".
- Empty states are positive statements, not blank boxes.
- Errors say what happened and what to do. No apologies, no vagueness.

## Accessibility

- Every state carries text or an icon in addition to color. Severity chips are labelled words, not bare dots.
- Text contrast ≥4.5:1; graphical objects and UI boundaries ≥3:1. Both themes.
- All interactive targets ≥44px.
- Minimum body size 14px. **Nothing meaningful lives at 11px.**
- Full keyboard operability, visible focus rings, no keyboard traps.
- Respect `prefers-reduced-motion`.

## Motion

Almost none. Hover states instant. A single 200ms fade on first paint is the maximum. In a tool where the numbers determine whether someone keeps their job, movement reads as instability.

## Vocabulary

One name per concept across every surface — axis labels, legends, tables, and copy must agree. Where a group is called "PM & clinical coord." on one axis and "Projects" in the legend beneath it, that is a defect, not a style choice.
