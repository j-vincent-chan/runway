# Task: restore the heading level, make adjacent numbers reconcile

Read `docs/design-system.md` first. The verdict is settled — this pass does not touch it beyond two small cases.

Full review: https://claude.ai/code/artifact/f32a7fc8-d56b-4542-af8b-61472dabbb0f

## Why

`Payroll is broadly healthy, funded about 20.5 months out, but 3 accounts are critical.` is the sentence this product needed for four reviews. It's done. Leave it alone.

Two things came out of the same pass that need attention:

1. **Three major section headings were demoted to caption size.** `Personnel cost`, `By team`, and `How these numbers were produced` were 20px/600 last pass and are now 10.5px uppercase mono — identical to `0 · 36 mo bar scale`. The design system's 20/28 step is now unused, and a 4,500px page has no landmarks.
2. **The depletion chart traded its named legend for anonymous dots.** The event layer is a good addition. Losing the names is a regression against *never show a count where a name is available*.

Plus a pass-4 backlog that didn't move.

**Scope.** One type-scale restoration, three sub-line clauses, one legend, and the carried items. No new components.

---

## Step 1 — Explore. No edits.

1. Find where section headings are rendered on the Dashboard and whether the demotion was a shared component change or per-section. Report which other pages inherit it.
2. In `metrics.ts`, find the denominator behind `AVG PAYROLL RUNWAY`. The stat row shows $3,969,318 and $181,978; 20.5 months implies a denominator of **$193,625**. Confirm that figure is reachable for display.
3. In `runwayRibbon.ts`, confirm the per-account runs-dry data still exists behind the new event dots — the names were rendered last pass, so the data should still be there.
4. Report whether the scope select can reach `PersonnelCostTrendCharts` and `FundingExposureBand`.

Wait for approval.

---

## Step 2 — Implement, one commit per unit

Branch `dashboard/hierarchy-and-reconciliation` off current HEAD.

### Commit 1 — `fix(ui): restore the section heading level`

Put the design system's **20 / 28, weight 600** step back on the six major sections:

- Needs attention
- Funding depletion
- Payroll runway, by team
- Personnel cost
- By team
- Funding exposure (by type and by team as one section)
- How these numbers were produced

Keep 10.5px uppercase mono for things that are genuinely subordinate: the context bar, chart notes, `0 · 36 mo bar scale`, column headers, and the caution callouts.

The test: a reader scrolling fast should be able to tell where a section starts without reading it.

### Commit 2 — `fix(stats): name the runway denominator`

Three numbers in a row, two of which divide into the third, off by 6.4%:

```
Available payroll     $3,969,318
Monthly payroll burn    $181,978
                        ÷ = 21.8 mo
Avg payroll runway       ~20.5 mo   ← implies $193,625/mo
```

Both are correct for their own definitions and the method section explains both. The row doesn't. Add the denominator to the runway sub-line:

```
past the 12-month window · on $193,625/mo of current account burn ·
unchanged since the Aug 26 payroll report
```

That also closes the zero-delta item — `was ~20.5 mo` where the current value is `~20.5 mo` becomes `unchanged since`.

### Commit 3 — `fix(teams): footnote the column totals`

Carried from pass 4, unchanged, gap identical to the dollar: Funds sums to $4,830,322 against $3,969,318; Burn/mo to $213,881 against $181,978.

Line under the table, 11.5px mono, `--muted`:

```
Teams sharing an account each carry its full balance and burn, so these columns
total more than the figures above.
```

Extend the method section's *Avg payroll runway* paragraph to say this of funds. It currently covers only burn.

Do **not** change the numbers — each row is right for its own question.

### Commit 4 — `fix(ribbon): bring the names back`

Keep the event dots and the legend — sizing by count and separating account exhaustion from employment changes is a real improvement.

Restore beneath them the named list from last pass: the earliest-exhausting accounts with their runs-dry months, critical ones in `--critical`, the remainder collapsed as `{n} other accounts · {m} of {n} run dry by {month}`.

Hovering a dot names the accounts it aggregates.

Label the `OC` marker or give it a legend entry — two letters in a circle with no key is unreadable.

### Commit 5 — `fix(ribbon): the green line states what is actually funded`

Carried from pass 4. `Funded through the full 12-month window` in `--healthy` sits ~350px under `23 of 35 accounts run dry inside the next 12 months.`

```
Total funds stay above zero through July 2027 — but 23 of 35 accounts run dry first.
```

Second clause is not optional. Green only when the count is zero.

### Commit 6 — `fix(verdict): chip and mixed-entity case`

Two small things, then the verdict is closed.

- The `CRITICAL` chip sits above `Payroll is broadly healthy` and reads as a disagreement. Either relabel it `3 CRITICAL` so it describes what it counts, or remove it — the sentence now carries severity in words, which is what the design system requires.
- The count clause assumes the critical set is all accounts. Handle the mixed case: `2 accounts and 1 person are critical`, plus singular and zero.

### Commit 7 — `fix(stats): keep the stat row's silhouette`

Two of three anchors show `Not enough history yet` where a sparkline would be. Keep the honesty — do not draw a flat line. Reserve the sparkline's height with a muted baseline rule so all three stats have the same shape.

### Commit 8 — `fix(ui): carried items`

- `Powered by the UCSF Office of Collaboration` still under the avatar bubble. Fourth pass.
- Notification bell reads 6 with no surface — route into the attention queue or remove the badge.

---

## Report, don't fix

**The Sep-26 exposure cliff.** Fourth pass. Institutional support and Projects collapse at the actual/projected seam and the mix reorders. Determine whether projected months carry funding-type attribution at all and report with code paths. If they don't, the projected region must say so rather than drawing a confident mix.

**Scope reach.** Per Step 1 — either wire the select to all three time series or move it into the depletion chart's header.

---

## Do not touch

- The verdict sentence itself
- The team runway table's structure, sort, bar scale, or subtitle
- The event dots and their legend on the depletion chart
- The uncategorized callouts and `less certain beyond here`
- Per-chart ordering in By team
- The method section beyond the one funds sentence
- Any other page, any financial calculation, any unrelated refactor

---

## Before you report done

Screenshot at 1440×900, both themes.

- [ ] A reader scrolling fast can tell where each major section begins.
- [ ] No two adjacent figures invite a calculation whose result the page contradicts.
- [ ] Every column a reader would sum either sums to the figure above it or says why not.
- [ ] No aggregate renders in `--healthy` while a named count contradicts it.
- [ ] Every dot, marker, and band on a chart can be traced to a named entity.
- [ ] The verdict handles mixed entity types, singular, and zero.
- [ ] The three anchor stats have the same silhouette with or without history.
- [ ] The disclaimer and attribution are both legible.
- [ ] Both themes render; no color defined only inside a media or theme block.
- [ ] Build, typecheck, lint green. No new dependencies.

---

## Next passes — not now

1. **Surface the method section.** Six paragraphs of the best explanatory prose in the product, at the bottom of a 4,500px page. A jump link from the verdict sub-line or context bar.
2. **Uncategorized as hatched grey; Endowment off the reserved green.**
3. **Accounts and people tables**, sorted by months remaining ascending.
