# Task: correct the Dashboard's first viewport

Read `docs/design-system.md` first. Everything there still applies. This file supersedes `dashboard-fold-task.md`, which is now history — six of its seven commits landed and are good. This is the correction pass.

Full review: https://claude.ai/code/artifact/c74b9464-f0d4-4b97-b0c0-949db00cc30e

## Why

The Dashboard now answers "how long does my money last, and for whom?" — a real improvement. But the first viewport leads with a $6,809 overdraft rendered larger than the $2,954,228 the program actually has, and no sentence anywhere reconciles the two. The verdict statement, specified last pass as "the single most important element in the product," was not built. A critical alert card took its slot, and that card answers a different question.

**Scope discipline.** This pass touches the first viewport, the personnel-group vocabulary and ordering, and two defects carried over from last pass. Do not rebuild anything below the fold beyond the one reorder in Commit 8.

---

## Step 1 — Explore. No edits.

Report before writing code:

1. Where the verdict slot's markup currently lives — the component rendering the full-width critical card, and what feeds it.
2. The selector behind "Shortest runway." Confirm whether a **portfolio** runway in months already exists elsewhere (the Runway page computes something like it) and whether a previous-import value is available for it.
3. Whether the horizon (24 months) is a constant, a setting, or derived, and whether the context bar's scope select is wired to it. They currently disagree: the select says 12, the depletion chart says 24.
4. Where personnel-group display names are resolved, and whether "Projects" as a *group* and "Projects" as a *funding type* come from the same table.
5. Whether projected months carry funding-type attribution at all — see the Report section.

Wait for approval.

---

## Step 2 — Implement, one commit per unit

Branch `dashboard/verdict-correction` off current HEAD. Build, typecheck, lint after each unit.

### Commit 1 — `feat(dashboard): verdict statement`

The component that was skipped last pass. Full width, directly beneath the context bar, 40/44px, weight 500. Data terms in `--ink`, connective words in `--ink-2`. Second clause takes `--critical` or `--healthy` per state.

Templated and deterministic. Never generated prose.

| State | Sentence |
|---|---|
| Beyond horizon, clean | `Funded past {horizon end} at your current rate.` + `No one runs short in that window.` in `--healthy` |
| Beyond horizon, exceptions | `Funded past {horizon end} at your current rate.` + `{n} {accounts\|account} {need\|needs} attention now.` in `--critical` |
| Dated, clean | `Funded through {month year} at your current rate.` + `No one runs short in that window.` |
| Dated, exceptions | `Funded through {month year} at your current rate.` + `{n} {people\|person} and {n} {accounts\|account} fall short before then.` |
| Insufficient data | `Not enough data to project runway.` + a plain line naming what's missing and a link to fix it. No fabricated date. |

**Revision to last pass's spec, deliberate:** the overdrawn state no longer leads. Previously this file said an overdrawn account should open the sentence. Seeing it built, that rule is what produced the inverted hierarchy. **The verdict always opens with the portfolio position and subordinates every exception to it.** Severity is carried by clause order and color, not by which fact goes first.

Zero, singular, plural in every clause. A zero-count clause is omitted entirely — never `and 0 accounts`.

**Sub-line**, 13px mono, `--muted`, three inputs, each with a dotted underline revealing its derivation on hover and on focus:

```
$2,954,228 available across 22 accounts · $186,288/mo trailing 3-month burn · runway beyond the 24-month window
```

When runway exceeds the horizon the third input says so. Never extrapolate a month count past the projection window.

The month in clause one links into the Runway page.

### Commit 2 — `refactor(dashboard): fold the critical card into the queue`

Delete the full-width critical alert card. Every critical item becomes a queue row at the same visual weight as its peers.

The queue header states the total — `Needs attention · 4` — so it matches the verdict's count and the reader knows whether the list is complete.

**Sort correction:** ties within Critical break by consequence date ascending. An account funded only through the current month outranks one already overdrawn by a small amount. Today the $6,809 overdraft is the hero and the endowment that runs dry *this month* is a small secondary row; that ordering is backwards.

Cap at 5 rows with `View all {n} →`.

### Commit 3 — `fix(dashboard): runway anchor returns to months`

"Shortest runway" is four problems in one stat: it shows dollars under a duration label in a row of dollar totals; it's a `min()` so it's dominated by one entity and unstable; it restates the card verbatim; and it dropped the previous-import comparison that was the point of the stat.

Restore it:

- **Value:** portfolio runway in months. If it exceeds the horizon, `24+ months`.
- **Sub-line:** target date · previous value from the last import — `was 11.2 last report`. When beyond horizon, `beyond the window · was 24+ last report`.
- **Sparkline:** months-remaining trend.

If no portfolio runway selector exists, **stop and ask.** Do not derive one.

The shortest-single-entity figure is queue content, not an anchor stat.

### Commit 4 — `fix(vocabulary): one name per concept`

Carried over from last pass, unfixed, and now worse.

- The count and cost charts label a bar `PM & clinical coord.` on the axis and `Projects` in the list directly beneath. Same bar, two names, now in both charts.
- In "Funding exposure by group," `Projects` is a personnel group in the row header **and** a funding type in the column header. A reader cannot tell which taxonomy `Projects · Projects · 61% · $40,486` reports.

Pick one canonical name per concept and hold it in every axis, list, legend, table, and string on the page. If both really are called Projects upstream, rename one in the UI and say which in the method section.

### Commit 5 — `fix(dashboard): one sort order for personnel groups`

The count chart, the cost chart, and the two lists beneath each sort by their own value descending — four orders for four groups on one screen. The eye cannot track a group across them.

Sort once by **cost descending** and hold that order in all four displays and in the exposure matrix.

### Commit 6 — `fix(ui): unobstruct the disclaimer`

Carried over from last pass, unfixed. The floating avatar bubble still cuts `Planning estimates only. Confirm with your finance/post-award analyst.` in half. This is the one defect on the page with a compliance dimension. Show it once, unobstructed.

### Commit 7 — `fix(charts): exposure axis label`

The funding-exposure y-axis top label renders as `0001%`. Should be 100%.

### Commit 8 — `refactor(dashboard): personnel cost above funding depletion`

The depletion chart occupies hero real estate and communicates less than the bar chart beneath it — 35 near-identical pale bands, no today rule, no zero-crossing labels, no funding-end markers, and a legend that runs on to `+30 more`.

Move personnel cost above it for now. Page order should reflect information density. **Do not attempt to finish the depletion chart in this pass** — it's a design problem, not a tweak, and it gets its own pass.

---

## Report, don't fix

**The funding exposure cliff.** Institutional support and Projects both collapse toward zero at Sep-26 — exactly the actual/projected seam — and the whole mix reorders. Either projected months cannot carry funding-type attribution, or there's a real cliff. Determine which, report with code paths, don't patch. If projections genuinely can't attribute funding type, the projected region must say so rather than render a confident-looking mix.

**Anomaly marking.** The method section states that a month differing from the trailing 12-month average by more than 20% is marked. Jan-26 clearly qualifies and carries no annotation. Report whether the rule isn't firing or the threshold isn't met.

**Scope/horizon disagreement.** The context bar select says "Next 12 months"; the depletion chart says 24. Report which is authoritative before either is changed.

---

## Do not touch

- The context bar, beyond wiring scope if Step 1 shows it should be
- The actual-vs-projected treatment in either time-series chart — it's the strongest thing on the page
- "How these numbers were produced" — genuinely excellent, leave it alone
- The since-last-report line and its materiality threshold
- The depletion chart itself, beyond its position
- Any other page, any existing financial calculation, any unrelated refactor

---

## Before you report done

Screenshot at 1440×900 in both themes.

- [ ] A reader can state their overall position in one sentence read off the page, without scrolling and without arithmetic.
- [ ] The largest element on the page describes the portfolio, not an exception.
- [ ] No fact appears twice in the first viewport.
- [ ] Runway is a duration and names its previous value.
- [ ] The verdict pluralizes correctly at zero, one, and many, in all five states.
- [ ] Every group has the same name in every chart, list, table, and legend.
- [ ] Every group appears in the same order in every display.
- [ ] The disclaimer is legible and unobstructed.
- [ ] Both themes render; no color defined only inside a media or theme block.
- [ ] Keyboard-navigable end to end with visible focus.
- [ ] Build, typecheck, lint green. No new dependencies.
- [ ] The three report-don't-fix items are reported, not resolved.

---

## Next passes — not now

1. **Finish the depletion chart** — today rule, terminal labels at each zero crossing, five earliest-exhausting accounts differentiated and directly labelled, the rest collapsed to one muted band, contrast raised to meet 3:1. Then move it back above personnel cost.
2. **Route the notification badge** — 5 unread, still with no surface on the Dashboard. Into the queue, or remove the badge.
3. **Accounts and people tables** — sorted by months remaining ascending.
4. **The two conflicting cost totals**, if still unresolved from last pass.
