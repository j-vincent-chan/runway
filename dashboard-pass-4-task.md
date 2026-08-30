# Task: state aggregates with their caveats

Read `docs/design-system.md` first. This supersedes `dashboard-pass-3-task.md` — nine of its thirteen findings landed, several better than specified.

Full review: https://claude.ai/code/artifact/6dd3459d-54fa-4e69-9f7d-7ff8e5d3aa91

## Why

Every fix in the last pass was well made. The team runway table is better than the anchor stat I asked for; the report-type-specific comparison basis is a more precise fix than the one I proposed; the verdict's copy discipline — em-dash, *averages*, declarative action — is three correct calls in a row.

What's left is one habit showing up in three components: **an aggregate is asserted at full confidence, and the caveat that makes it true lives somewhere else on the page.**

- The verdict names an overdrawn account and a team average, and never says the program holds $3,869,318 / ~20.0 mo.
- The depletion chart says `23 of 35 accounts run dry inside the next 12 months`, then closes with `Funded through the full 12-month window` in `--healthy`.
- The team table's Funds column sums to $4,730,322 against a $3,869,318 anchor stat, and nothing at the table says why.

One rule fixes all three: **a number and the caveat that qualifies it appear in the same breath, or the number isn't shown.**

**Scope.** Copy and one footnote. No new components.

---

## Step 1 — Explore. No edits.

1. In `verdict.ts`, confirm `buildVerdict` has access to overall available funds and `overallRunwayMonths` in the branch at line ~248. It takes `overallRunwayMonths` already — confirm the funds figure is reachable without a new selector.
2. In `runwayRibbon.ts`, find what produces `Funded through the full {n}-month window` and whether it tests the aggregate or the per-account series.
3. In `teamRunway.ts`, confirm shared accounts contribute full funds **and** full burn to every team that draws on them. The method section documents the burn side only.
4. Report whether the scope select can reach `PersonnelCostTrendCharts` and `FundingExposureBand`, or whether their window is fixed.

Wait for approval.

---

## Step 2 — Implement, one commit per unit

Branch `dashboard/aggregate-caveats` off current HEAD. Build, typecheck, lint after each unit.

### Commit 1 — `fix(verdict): lead with the portfolio position`

Third attempt at this one. The averaging guard at `verdict.ts:248` stays exactly as it is — it picks the right subject. The change is that the sharp fact no longer *replaces* the position, it follows it.

Current:

```
ImmunoDiverse Community Manager · 7032261 is already overdrawn —
Communities, your weakest team, averages 11.3 months.
```

Target:

```
Payroll is funded about 20 months out, but ImmunoDiverse Community Manager · 7032261
is already overdrawn — Communities, your weakest team, averages 11.3 months.
```

- Position clause in `--ink` / `--ink-2`, first.
- Exception clause keeps `--critical`.
- Apply to **every** state, including the roll-up path at line ~200 and the stable path. A stable verdict already leads with position; it should keep doing so.
- `verdictText` picks the change up for free; update the test expectations.

Round the position to whole months in prose (`about 20 months`) — one decimal is stat precision, not sentence precision.

### Commit 2 — `fix(ribbon): the green line states what is actually funded`

`Funded through the full 12-month window` is true of the aggregate pool and false of most accounts, and it's the last thing in the section, in the colour reserved for confirmed-good.

Replace with the aggregate named and the exception attached:

```
Total funds stay above zero through July 2027 — but 23 of 35 accounts run dry first.
```

The second clause is not optional. If the count of accounts running dry is zero, the line is green with no second clause. If it is non-zero, the line is `--ink` with the count in `--critical`. **Never `--healthy` while any account in the window runs dry.**

### Commit 3 — `fix(teams): footnote the column totals`

Every row's arithmetic is correct — funds ÷ burn reproduces the stated runway for all four teams to the decimal. The columns are the problem: shared accounts are counted in full for each team, so Funds overshoots by 22% and Burn by 18%.

Add a line directly under the table, 11.5px mono, `--muted`:

```
Teams sharing an account each carry its full balance and burn, so these columns
total more than the figures above.
```

Extend the method section's *Avg payroll runway* paragraph to say the same of funds. It currently documents only the burn side.

Do **not** change the numbers. The per-team figures are right for their own question; only the invitation to sum them is wrong.

### Commit 4 — `fix(stats): unchanged reads as unchanged`

`~20.0 mo` above `was ~20.0 mo under the Aug 26 payroll report` states a zero delta as a repetition. When the previous value equals the current one within display precision:

```
unchanged since the Aug 26 payroll report
```

### Commit 5 — `fix(ui): finish the footer layering`

The disclaimer is legible now. `Powered by the UCSF Office of Collaboration` beneath it is still under the avatar bubble. Third pass on this one.

### Commit 6 — `fix(stats): keep the stat row's shape`

Two of three anchors show `Not enough history yet` where a sparkline would be. The honesty is right — do not draw a flat line. Reserve the sparkline's height with a muted rule or an empty plot area so the three stats keep the same silhouette.

### Commit 7 — `fix(charts): scope reach`

Either wire the scope select to `PersonnelCostTrendCharts` and `FundingExposureBand`, or move the control into the depletion chart's header. A page-level control that moves one of three time series teaches the reader it doesn't work. Step 1 decides which.

---

## Report, don't fix

**The Sep-26 exposure cliff.** Third pass. Institutional support and Projects collapse toward zero exactly at the actual/projected seam and the mix reorders. Every other trust affordance on the page has been tightened; this is now the only place a confident-looking figure sits over something the model may not know. Determine whether projected months carry funding-type attribution at all, and report with code paths.

---

## Do not touch

- The averaging guard, `pickWorstItem`, or the status chip mechanism
- The team runway table's structure, sort, bar scale, or subtitle — it is the best component added in three passes
- The per-team funds and burn figures themselves
- `18 of 30 run dry by July 2027` and the rest of the depletion legend
- The uncategorized callouts
- The method section beyond the one funds sentence
- `By team` chart ordering — the per-chart ranking is settled and correct
- Any other page, any financial calculation, any unrelated refactor

---

## Before you report done

- [ ] The verdict states what the program has before what threatens it, in all five states.
- [ ] No aggregate on the page is stated in `--healthy` while a named detail contradicts it.
- [ ] Any column a reader would naturally sum either sums to the figure above it or says why not.
- [ ] A zero delta reads as "unchanged", not as a repeated number.
- [ ] The three anchor stats have the same silhouette whether or not history exists.
- [ ] The scope control's reach matches where it sits.
- [ ] `verdict.test.ts` updated; the caution-boundary test from pass 3 still present.
- [ ] Both themes render; no color defined only inside a media or theme block.
- [ ] Build, typecheck, lint green. No new dependencies.

---

## Next passes — not now

1. **Route the notification badge** — reads 6, still no surface.
2. **Uncategorized as hatched grey; Endowment off the reserved green.** Lower priority now that the callouts carry the meaning in words.
3. **Accounts and people tables**, sorted by months remaining ascending.
