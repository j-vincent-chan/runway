# Task: rebuild the Dashboard's first viewport

Read `docs/design-system.md` before you start. Everything there applies; this file covers only what's specific to this change.

## Why

The Dashboard answers "what did my lab spend?" It does not answer "how long does my money last, and for whom?" — which is the product's purpose. No dollar figure anywhere on the page represents unspent money. The one forward-looking element says "2 personnel require funding attention" with no names, no dates, no amounts.

This change replaces everything from the top of the Dashboard content area down to (but not including) the "Personnel cost & headcount" section.

**Scope discipline matters here.** This is the first of seven passes. Do not rebuild the whole page.

---

## Step 1 — Explore. No edits.

Stay in plan mode. Delegate the codebase reading to a read-only subagent so this conversation stays clean, then report:

1. **Stack:** framework, styling approach, chart library, data-fetching pattern, file conventions. You will match all of them.
2. **Data:** the Account Balances and Runway pages already compute what this task needs. Find and list the existing selectors, hooks, or services that provide:
   - total available funds across accounts the user owns or manages, and per-account balances
   - monthly personnel cost history
   - per-person funded-through date and funding gap
   - the existing runway/depletion calculation
   - previous-import values, for deltas
   - import metadata: filename, timestamp, sync state, period, and whether the period is closed
3. **Gaps:** anything above you could not find. If a needed value doesn't exist, say so and stop. Do not invent a derivation.
4. **Plan:** files to add, files to edit, selectors to import, and your commit sequence.

Wait for approval before writing code.

---

## Step 2 — Implement, one commit per unit

Branch off current HEAD as `dashboard/first-viewport`. Run build, typecheck, and lint after each unit. Do not proceed to the next unit on a red build.

### Commit 1 — `feat(ui): add design tokens`

Put the palette, type scale, and spacing base from `docs/design-system.md` into whatever token or theme mechanism already exists. If none exists, create one file. Do not hardcode these values in components. Build the projected-data treatment (45% opacity + 45° hatch + dotted stroke) as a reusable pattern now, even though this pass barely uses it — six later passes depend on it.

### Commit 2 — `feat(dashboard): context bar`

A 32px strip beneath the page title, 11.5px mono, `--muted`, one hairline rule under it.

Contents, middot-separated: period with explicit closure state (`August 2026 payroll · closed` or `· in progress`), import timestamp, sync state, source filename as a link.

The closure state is required — the page currently draws an in-progress month as a complete bar.

Right-aligned: a page-level scope control (next 12 / 24 / 36 months) as a native select or a ≥44px control, not a 28px segmented strip. It scopes the whole page. **Only offer windows the data supports** — the existing funding-mix control offers "Avg of last 3 years" against fourteen months of data. Compute the available range and disable or omit the rest.

### Commit 3 — `feat(dashboard): verdict statement`

The single most important element in the product. Full width, 40/44px, weight 500. Data terms in `--ink`, connective words in `--ink-2`, so the sentence scans as a figure rather than as prose.

Templated and fully deterministic. Never free-form generated text. Handle every state:

| State | Sentence |
|---|---|
| At risk | `Funded through {month year} at your current rate.` + `{n} {people\|person} and {n} {accounts\|account} fall short before then.` |
| Healthy | `Funded through {month year} at your current rate.` + `No one runs short in that window.` — second clause in `--healthy` |
| Beyond horizon | `Funded past {horizon end} at your current rate.` **Never extrapolate a date beyond the projection horizon.** |
| Overdrawn | Lead with it: `{account} is overdrawn by {amount}.` then the funding-through clause. |
| Insufficient data | `Not enough data to project runway.` + a plain line naming exactly what's missing and a link to fix it. **No fabricated date.** |

Singular, plural, and zero in each clause. If only people are at risk, the clause reads `Two people fall short before then.` — never `and 0 accounts`.

**Subline**, 13px mono, `--muted`: the three inputs. `$1,418,600 available across 7 accounts · $188,114/mo trailing 3-month burn · 9.8 months of runway`.

The runway month links into the Runway page. Each subline figure gets a dotted underline; hover or focus reveals how it was derived, in plain language.

### Commit 4 — `feat(dashboard): anchor stats`

Three stats in a row, separated by hairlines, **not wrapped in cards**. Left 7 of 12 columns.

Each: 10.5px uppercase mono label, 26px tabular value, 12px sub-line with the comparison, 34px sparkline.

| | Value | Sub-line | Sparkline |
|---|---|---|---|
| Available funds | total across owned/managed accounts | account count · delta vs. last report | balance over recent periods, line |
| Monthly burn | trailing 3-month average | `3-mo avg` · delta vs. prior quarter | last 9–12 months, bars |
| Runway | months remaining | target date · **previous value from last import** | months-remaining trend, line |

"was 11.2 last report" is the most decision-relevant number on the page after the date itself. Do not omit it. Each stat links to its source page.

### Commit 5 — `feat(dashboard): attention queue`

Replaces the anonymous "2 personnel require funding attention" card. Right 5 of 12 columns, beside the anchors. One bordered block of rows with a 3px severity stripe on the block's left edge.

Each row: severity chip → entity name → group or account code → the date it becomes a problem → the dollar gap → an action verb link (`Reassign`, `Review`, `Categorize`).

```
● M. Chen · Research dev · funded to Nov 26 · gap $42,300      Reassign →
● 5R01-118440 · overdrawn $8,110 · closes Dec 26               Review →
◐ R. Okafor · Data and AI · funded to Feb 27 · gap $61,900     Reassign →
◐ Data and AI · 68% of cost unattributed ($16,500/mo)          Categorize →
```

Severity:

- **Critical** — account overdrawn now, or a person's funding ends within 3 months
- **Caution** — funding ends in 3–6 months, or an account has under 6 months remaining
- **Data quality** — a group with more than 10% of its cost unattributed

Sort critical first, then date ascending, then gap descending. Cap at 5 rows with `View all {n} →`.

The queue mixes people, accounts, and data-quality issues in one severity order. Unattributed cost is a first-class item here, not a percentage buried in a legend. Severity is communicated by chip text **and** icon **and** position — never color alone. Each row deep-links with the entity preselected.

Empty state: one line in `--healthy` — `No funding gaps in the next {n} months.` Never a blank box.

### Commit 6 — `refactor(dashboard): remove superseded elements`

- **Delete the navy "Key changes" band and its four cards.** Superseded by commits 3–5.
- **Delete the yearly stacked bar chart entirely.** The monthly series begins Jul-25, so it charts six months of 2025 against twelve months of 2026 as peer bars — invalid, and it contradicts the "↓12% YoY" claim above it. Do not patch it; remove it. Its actual-vs-projected stacked treatment is the good idea, and it moves to the monthly chart in a later pass.
- **Remove the headcount line and its second axis** from the monthly cost chart. On a 12–15 scale it renders a one-person change as a cliff. Leave the cost bars alone. State team size as a stat with a delta instead.

### Commit 7 — `fix(dashboard): label and layering defects`

- In "Personnel count by group," the top bar is labelled `PM & clinical coord.` on the axis and `Projects` in the legend directly beneath. Same bar, two names. Pick the canonical vocabulary and use it in both.
- The floating avatar bubble in the lower-left overlaps the sidebar disclaimer, cutting "Planning estimates only. Confirm with your finance/post-award analyst." in half. Fix the layering. The same disclaimer also appears in the footer — show it once, unobstructed.

---

## Report, don't fix

The page publishes **two different totals for the same month**: `$188,114` under "By personnel group" and `$128,777` under "Funding type mix," both labelled Aug-26, both described as the planning roster, differing by `$59,337`. Each set sums correctly within itself.

Trace what each figure includes and report your finding with the relevant code paths. **Do not guess which is right and do not silently reconcile them.** We'll decide together. The eventual rule is one authoritative cost figure on the Dashboard, stated once, with a footnote defining what it includes.

---

## Do not touch

- The monthly cost chart beyond removing the headcount line
- The "By personnel group" section beyond the label fix
- The "Funding type mix" section and its donuts — slated for replacement, but not now
- Any other page: Timeline, Projections, Runway, Account Balances, Employees, Upload
- Any existing financial calculation
- Unrelated refactors, dependency upgrades, or formatting-only changes

---

## Before you report done

Verify each yourself. Take a screenshot at 1440×900 in both themes and check it.

- [ ] At 1440×900 with the sidebar open, a user sees without scrolling: the runway date, available funds, monthly burn, runway in months, the direction all three are moving, and the named people and accounts at risk.
- [ ] No arithmetic is required of the reader to answer "am I OK?"
- [ ] The verdict renders correctly in all five states and pluralizes correctly including zero.
- [ ] The attention queue names entities. No bare count appears anywhere.
- [ ] The attention queue's empty state is a positive statement.
- [ ] Every dollar figure uses tabular figures and is larger than its own label.
- [ ] Every delta states its comparison basis in words.
- [ ] Every projected figure is marked by pattern and explains its derivation on hover or focus.
- [ ] The period's closure state is stated explicitly.
- [ ] Both themes render correctly; no color is defined only inside a media or theme block.
- [ ] Contrast and target sizes verified in both themes.
- [ ] Keyboard-navigable end to end with visible focus.
- [ ] Build, typecheck, and lint are green.
- [ ] No new dependencies were added without asking.
- [ ] The two-totals discrepancy is reported, not resolved.
- [ ] Nothing outside the declared scope was modified.

---

## Next passes — do not build these now

Listed so your component boundaries leave room:

1. **Runway ribbon** — full-width stacked depletion area, today → +24 months, stacked by account so one account's exhaustion shows as a band ending; today rule; hatched uncertainty cone widening from month 6; staff funding-end markers as labelled ticks; terminal label at the zero crossing. Becomes the hero chart directly beneath the verdict.
2. **"What changed since {previous report}"** — report-to-report diff where each change states its consequence: "Personnel cost fell 12% — runway extended by 0.4 months." Changes with no runway consequence are omitted rather than padded.
3. **Burn and projection** — the monthly chart rebuilt as one continuous series through the horizon, actual solid and projected hatched, trailing-12-month reference line, inline anomaly annotations, projection rule named beneath in readable type with an "Adjust" link.
4. **Funding exposure** — replaces all five donuts with a 100% stacked band over time plus end-date markers, and a group × funding-type matrix.
5. **Accounts table** — sorted by months remaining ascending, so problems float to the top by construction.
6. **People table** — one row per person with a funding-split microbar and funded-through month; group subtotals as collapsible headers carrying average cost per person.
7. **"How these numbers were produced"** — expanded section, not a collapsed accordion, in body type rather than fine print.
