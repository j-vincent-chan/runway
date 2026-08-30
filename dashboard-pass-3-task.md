# Task: correct what the Dashboard says

Read `docs/design-system.md` first. This supersedes `dashboard-pass-2-task.md` — eight of its eleven findings landed, several of them very well. This pass is mostly copy and template work, not new components.

Full review: https://claude.ai/code/artifact/98702027-9b81-4300-8aa3-f28c7c81fdfc

## Why

The verdict statement now exists and is well-engineered — five states, 15 tests, a status chip so severity is never color-only, and `pickWorstItem` reading the queue's own first row so the headline and the list can never name different entities. Good work.

But the sentence it currently produces is:

> ImmunoDiverse Community Manager · 7032261 is already overdrawn, well before Communities, your weakest team, at 11.3 months.

Every number in it describes a problem or one team. `$3,737,837` and `~19.3 mo` appear nowhere. A reader who reads only the verdict — the entire point of a verdict — never learns whether the program is solvent.

**Scope.** Verdict copy, three stat-row defects, and a handful of carried-over items. No new components. Do not touch the depletion chart, the method section, or the uncategorized callouts.

---

## Step 1 — Explore. No edits.

1. In `metrics.ts` (or wherever the anchor row is fed), find what drives Available payroll's `no prior report to compare` and what drives Avg payroll runway's `was 19.3 mo at the Aug 26 report`. **These two contradict each other in the same row.** Report which is correct before changing either.
2. Confirm whether the scope select is wired to anything besides the depletion chart. Personnel cost and funding exposure both appear to ignore it.
3. In `fundingExposure.ts`, confirm whether projected months carry funding-type attribution at all.
4. Report the `CAUTION_MONTHS` and `CRITICAL_MONTHS` values and whether `statusFor` uses `>=` or `>` at the caution boundary.

Wait for approval.

---

## Step 2 — Implement, one commit per unit

Branch `dashboard/verdict-copy` off current HEAD. Build, typecheck, lint after each unit.

### Commit 1 — `fix(verdict): lead with the portfolio position`

The averaging guard at `verdict.ts:248` is correct logic and should stay. The problem is that leading with the sharp fact was allowed to **replace** the position rather than precede it.

Every state's sentence now opens with where the program stands, then names what threatens it:

```
Payroll is funded about 19 months out, but ImmunoDiverse Community
Manager · 7032261 is already overdrawn.
```

- Position clause in `--ink` / `--ink-2` as now.
- Exception clause keeps `--critical`.
- The status chip and `action` line are unchanged.
- Where no exception outranks the position, the second clause stays as built.

Update `verdict.test.ts` expectations. Every existing test asserts the old ordering, so this commit is mostly a test rewrite — that's expected, not a sign something is wrong.

### Commit 2 — `fix(verdict): branch the connective on the overdrawn case`

`", well before "` was written for the duration comparison. In the overdrawn branch the duration segment is dropped but the connective is kept, producing *"is already overdrawn, well before Communities … at 11.3 months"* — a present-tense state compared to a future duration using a word that implies both are ahead.

Overdrawn branch:

```
…is already overdrawn — Communities, your weakest team, averages 11.3 months.
```

Non-negative branch keeps `well before`, which reads correctly there.

### Commit 3 — `fix(verdict): qualify team runway as an average`

Wherever the verdict names a team's runway, the word is **averages**, not `at`. The queue currently shows a Communities person funded through December 2026 — about four months — directly beneath a verdict asserting Communities is at 11.3 months. Both are true; the method section explains why. The qualifier makes the caveat travel with the number instead of waiting at the bottom of the page.

Same change in the "every team holds" stable sentence.

### Commit 4 — `fix(stats): resolve the prior-report contradiction`

Available payroll says `no prior report to compare` and `Not enough history yet`. Avg payroll runway, in the same row, says `was 19.3 mo at the Aug 26 report`.

Per Step 1, fix whichever is wrong. If the prior import genuinely lacked balances, say that specifically — `balances not in the Jul 26 report` — rather than asserting no prior report exists.

### Commit 5 — `refactor(stats): remove pagination from the runway anchor`

The runway slot carries `‹ 1/5 ›` while its two neighbours don't. One member of a three-stat row changes identity on click, the value shown depends on where the last reader left it, and the arrows are well under the 44px target minimum.

- Anchor shows all-teams runway, always.
- Per-team runway moves to a small table below the fold, or to the Runway page — **sorted ascending** so the weakest team is first by construction.

### Commit 6 — `fix(copy): name the window on both uncategorized callouts`

`13% of personnel cost has no funding type` and `15% of this month's cost has no funding type` sit 400px apart and measure different windows. Only the second says so. Make the first read `13% of the last 12 months' cost`.

### Commit 7 — `fix(copy): declarative action line`

`Move money onto it or cut its burn now.` instructs, directly above a sidebar reading *Planning estimates only. Confirm with your finance/post-award analyst.*

Change to `Needs funding or a burn cut now.` — same information, no instruction. Apply the same treatment to the at-risk string.

**Ask before changing** `No funding action needed right now.` — it's the highest-liability string in the product and deserves an explicit decision rather than a default.

### Commit 8 — `fix(ui): carried-over defects`

- Exposure y-axis label still clipped — was `0001%`, now `0003%`. Widen the container and round the domain.
- `Powered by the UCSF Office of Collaboration` still under the avatar bubble. The disclaimer above it is now legible; finish the job.
- The 20% anomaly rule described in the method section doesn't render. Jan-26 qualifies and carries no mark.
- `~19.3 mo` carries a tilde; `was 19.3 mo` doesn't. Same kind of estimate.

### Commit 9 — `fix(charts): uncategorized as a hole, not a category`

The design system asks for hatched grey so unattributed money reads as missing rather than as a sixth funding type. The new caution callouts do most of this work in words; the band itself doesn't.

Also: Endowment is currently drawn in the reserved healthy green. Categorical color is permitted in this band, so it isn't a rule break — but spending the semantic green on a category weakens it everywhere else. Pick a different hue for Endowment.

---

## Report, don't fix

**The Sep-26 exposure cliff.** Carried from pass 2, still unexplained. Institutional support and Projects collapse toward zero exactly at the projection seam and the mix reorders. If projections can't attribute funding type, the projected region must say so — rendering a confident mix over an attribution the model doesn't have is the one place this page overstates what it knows.

**The caution boundary.** `statusFor` returns stable at `months >= CAUTION_MONTHS`, but the stable sentence reads *"Every team holds more than 6 months."* A team at exactly 6.0 makes that false, and no test exercises the boundary. Report whether to change the copy or the comparison.

**Scope reach.** The select governs the depletion chart only. Report what it would take to scope all three time series, or recommend moving the control into the depletion chart's header instead.

---

## Open question — your call

Last pass I asked for one sort order across all four group displays. You built it, and the consequence is that the personnel-count bars now run 5, 3, 2, 4 — a bar chart that isn't rank-ordered, because it follows cost order.

With four groups, the cross-referencing benefit is smaller than I assumed. Either is defensible. If you'd rather each chart rank its own values, keep each list matched to its own chart and hold one order only in the exposure matrix, where a reader genuinely scans across rows.

No commit until you decide.

---

## Do not touch

- The depletion chart — legend, runs-dry dates, and the `less certain beyond here` boundary are the best work on the page
- The method section, including the new averaging paragraph
- The uncategorized callouts' wording or the `Assign funding types` link
- `pickWorstItem`, the averaging guard, or the status-chip mechanism
- The attention queue's structure or sort
- Any other page, any financial calculation, any unrelated refactor

---

## Before you report done

- [ ] The verdict states what the program has before it states what threatens it, in all five states.
- [ ] No sentence compares a present state to a future duration.
- [ ] Team runway is qualified as an average wherever it appears in prose.
- [ ] No two elements in the stat row disagree about whether a prior report exists.
- [ ] Every anchor stat shows the same subject on every visit.
- [ ] Both uncategorized percentages name their window.
- [ ] No string in the product instructs the reader to move money.
- [ ] `verdict.test.ts` covers the caution boundary at exactly `CAUTION_MONTHS`.
- [ ] Both themes render; no color defined only inside a media or theme block.
- [ ] Build, typecheck, lint green. No new dependencies.
- [ ] The three report-don't-fix items are reported, not resolved.

---

## Next passes — not now

1. **Route the notification badge** — now reads 6, still with no surface on the Dashboard.
2. **Accounts and people tables** — sorted by months remaining ascending.
3. **Scope the whole page** to the select, if Step 1 says it's tractable.
