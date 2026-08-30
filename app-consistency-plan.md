# Plan: make the app agree with the Dashboard

Read `docs/design-system.md` first. This is a **plan, not a work order** — nothing here should be implemented until you've decided what you want. Stage 1 is the exception: those four items break tasks today.

Full review: https://claude.ai/code/artifact/429bf519-05a4-4d3b-8de7-dcbba86489b5

## The finding

Five passes made the Dashboard good. The other seven pages haven't had that attention. The Dashboard is where every journey starts, so the inconsistency between it and everything else is what a faculty member actually experiences.

Almost nothing below is new design. It is taking what the Dashboard already proved — a vocabulary, a stat row, a provenance bar, a rule about colour — and making the rest of the app agree.

---

## Stage 1 — Breaks a task

### 1.1 The Dashboard's queue links go nowhere specific

All four attention-queue actions resolve to a bare `/runway`:

```
link [ref_16] href="/runway"     Review  → ImmunoDiverse Community Manager
link [ref_17] href="/runway"     Review  → Otani_Optimizing
link [ref_18] href="/runway"     Review  → ImmunoX CSO Endowment
link [ref_19] href="/runway"     Reassign → Jonathon D Wilson
```

The design system requires each row to deep-link with the entity preselected. And `Reassign` lands on Runway, where you cannot reassign anyone — that's Projections.

| Verb | Should go to |
|---|---|
| `Review` (account) | `/runway?account={key}` — scrolled to and highlighted |
| `Reassign` (person) | `/projections?person={key}` |
| `Categorize` (team) | `/settings?panel=accounts&team={key}` |

The verb and the destination have to agree.

### 1.2 Runway clips its own primary column at 1440×900

The runway bars run off the right edge at the width the design system targets. The page exists to show months remaining and that is the column that gets cut. Drop or narrow a column, or make the table horizontally scrollable within its own container with the runway column pinned.

### 1.3 Employees clips its trend column at 1440×900

Same shape, lower stakes.

### 1.4 Stat labels navigate, stat values open a popover

On the Dashboard the label is a link and the value is a button, two lines apart, with nothing to tell them apart. Make the whole stat block one link to its source page and move the derivation onto the dotted-underline hover already specified for the verdict sub-line.

Also: `Monthly Payroll Burn` links to `/timeline`, where the same figure is labelled `Total monthly salary + benefits`.

---

## Stage 2 — Vocabulary

The highest-leverage change in the product, and mostly find-and-replace. **Decide the canonical term, write it into `docs/design-system.md`, then apply it everywhere including help text, badges, tooltips, and button labels.**

### "An account that isn't yours" — six phrasings

| Where | Currently |
|---|---|
| Runway | `Landmark = external (not yours)` |
| Runway | `2 accounts not under your control` |
| Runway | `External account` · `Assumed OK` |
| Distributions | `accounts you do not manage` |
| Projections | `accounts you do not manage` |
| Dashboard method | `An account you've marked as not yours` |
| Code | `runwayAssumedOkFunds` |

Recommend **"Not my account"** — it reads plainly and matches the account group you're planning.

### "Monthly salary and benefits" — four names, two values

| Page | Label | Value |
|---|---|---|
| Dashboard | Monthly payroll burn | $188,114 |
| Distributions | Total monthly salary + benefits | $188,114 |
| Projections | Monthly personnel burn | **$193,778** |
| Employees | Monthly S+B | per person |

Three are the same measure under three names. The fourth is a *different* measure under a near-identical name — and it's the denominator behind the Dashboard's runway figure. Naming them apart makes the Dashboard's Available ÷ Burn discrepancy self-explaining.

### Hidden items — three labels, two sets

`Show 8 hidden funds` / `Show hidden (8)` / `Show hidden (13)`. The counts differ because they're different hidden sets (per-person fund hides vs account-level hides). Nothing says so, so the 13 reads as a bug. One label, and name the scope.

### Page names

- Nav says **Distributions**, route is `/timeline`, Upload has a `View Timeline` button ×2, Runway's help text says `hide from timeline`.
- Nav says **Upload**, page title is **Data Sources**.
- **Account Balances** is called `Accounts` in Settings and in Upload's "What This Powers".

### The team-name mismatch is still live on Employees

The legend reads `Research dev · Projects · Data and AI · Communities`; the row pills read `PM & clinical coord.` This is the original review-1 defect. It was fixed on the Dashboard and never here.

---

## Stage 3 — Extract three components from the Dashboard

### 3.1 The stat row

Six treatments across eight pages: hairline+sparkline (Dashboard), 2 cards (Distributions), 4 cards + a pastel gradient strip (Projections), inline mono (Account Balances), a sentence (Status), a right-rail list (Upload), none (Runway, Employees).

The Dashboard's is correct per the design system — hairline-separated, no card chrome, comparison basis in words, sparkline or an honest empty state. Make it a component and use it everywhere. **Delete the gradient strip on Projections outright** — it breaks the no-gradients rule.

### 3.2 The provenance bar

Six of eight pages carry `Source: [payroll file] · Imported … · Cloud sync on`. Status and Upload carry none. The Dashboard's is richer and differently ordered — it leads with the period and its **closure state**, which no other page shows.

Distributions needs the closure state most: its subtitle says "actual payroll through this month".

**Account Balances cites the wrong file** — the payroll report, on a page whose subtitle says the data comes from Net Position Reports.

### 3.3 The section heading

Restore the design system's 20/28 weight-600 step on major sections everywhere, with 10.5 mono caps reserved for genuinely subordinate labels.

---

## Stage 4 — Colour

The design system permits categorical colour in exactly one place and gives personnel groups none.

| Where | What gets colour | Verdict |
|---|---|---|
| Dashboard | Teams, all one teal | Correct |
| Employees | Teams, four categorical dots | Contradicts the Dashboard |
| Account Balances | Account groups, green pills | Spends reserved `--healthy` |
| Distributions | Funding sources, pastel palette | A sixth palette, low contrast |
| Funding exposure band | Funding types | The one sanctioned place |

Teams monochrome everywhere. Semantic colours reserved. One categorical palette, in the exposure band only.

---

## Stage 5 — Give every page an opening sentence

Status already does it: *"Waiting longest: Ohnmar Chan, submitted Aug 30, 2026 and still pending."* That's the Dashboard's verdict pattern generalised — a conclusion before its evidence.

Runway, Account Balances and Employees would each be better for one line of the same kind.

---

## Smaller items, by page

**Distributions** — the code column isn't unique (two rows read `146328D`; several people carry two rows both reading `1111111`). Dark navy group bands are the heavy device removed from the Dashboard in pass 1.

**Projections** — the inline rule builder (*"Put [person] on [account] at [n]%"*) is the best interaction idea in the product and should become a named component. `Horizon` offers Rest of FY / 6 / 12 / 24; the Dashboard offers 6 / 12 / 24 / 48. Neither contains the other.

**Runway** — no summary stats at all, on the page three Dashboard links point to.

**Account Balances** — `VS PRIOR` is a column of em-dashes with `needs 2+ periods` repeated on every row. Say it once above the table. The free-text filter is the fastest control in the app and should exist on Runway and Employees.

**Status** — "Waiting longest" is meaningless when all requests share a submission date; needs a fallback. Two rows are visually identical except for one date range.

**Employees** — `First gap: Jul-24` is two years in the past, in caution amber. Stale or mislabelled.

**Upload** — "What This Powers" mixes page names with capability names. `Last import 8/25/2026 8:58 PM` here against `Imported 8/23/2026 7:05 AM` in every provenance line — two timestamps, neither labelled to distinguish them. Employee counts differ across three pages (14 / 13 active / 13 + 2 alumni); probably all correct, nothing says why.

**Settings** — remove the developer instruction (*"re-run `supabase/schema.sql` in the SQL editor"*) from a faculty-facing surface, and say "cloud sync" rather than "Supabase". No subtitle, unlike every other page.

**Dashboard** — the scope select offers 48 months against roughly fourteen months of actuals. Review 1 specified: only offer windows the data supports.

---

## Do not touch

- The Dashboard's verdict, attention queue, or team runway table
- Upload's onboarding flow — numbered required step, per-file parse status, Import Health
- Status's opening sentence
- Runway's inline editable balances with an as-of date
- Settings' analyst access panel
- Account Balances' free-text filter
- The overall mono-and-sans aesthetic, which holds on every page
