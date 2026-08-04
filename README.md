# Pantry Rhythm

A grocery list that tracks how often you actually buy something, not just
what's on the list. That gets you two things a plain checklist can't:

1. **Catches overbuying** — flags when you're repurchasing something way
   sooner than your own normal pace for it.
2. **Catches forgetting** — surfaces items that quietly went stale on your
   shelf because you never re-added them to the list.

No backend, no build step. Open `index.html`, it works. Data lives in
`localStorage`.

## About this project

Built through iterative prompting with Claude, as part of a FlyRank AI
internship assignment on prompt engineering. The code, the features, and
the classification logic were shaped by the prompts, not written by hand.
The point of the assignment was the prompting process — not the code
itself.

I started with the laziest possible prompt: "create a web based grocery
list maker for me." Bad on purpose, to have a baseline. It gave back a
plain checklist, and I wasn't satisfied — that was the point.

From there it went through five rounds, each one adding a specific
prompting technique:

- **Role assignment** — gave it a role ("developer specializing in
  customer-facing retail apps"). It leaned into the gimmick — receipt
  styling, stamp effects — but lost functionality it had in round one. On
  raw usefulness, the first version was still better.
- **Context and motivation** — told it *why*: shoppers forget to re-add
  things, or overbuy without noticing. This is where it got hard to hold
  the line. Adding a "why" and adding a feature are a thin line to walk,
  and I caught myself wanting to slip features in under the cover of
  motivation. The more context I gave it, the smaller the circle got
  around what the app actually was.
- **Few-shot examples** — gave it six worked examples of what counts as
  overbuying vs. normal pace (milk, coffee, salt, and so on). This is
  where the ratio logic below came from. I leaned on Claude to help me
  come up with the examples themselves — open-ended example generation is
  something I still struggle with.
- **Output structure** — asked for separate HTML/CSS/README files.
  Didn't touch functionality, just organization. It handed back a
  JavaScript file too, unprompted, which surprised me since nothing
  before that iteration had needed one.
- **Step decomposition** — told it the build order: data model, then
  classification logic, then UI, then docs. This is the version in this
  repo. The logic even caught and fixed a gap from the few-shot round —
  it flagged that its own "normal" band and "forgotten" cutoff had been
  extrapolated, not verified against a real example.

The last prompt in that chain was written to be model-agnostic — same
result regardless of which AI runs it. I tested it against Gemini to
check that. The logic came out close to identical; the UI didn't — Gemini
leaned more dashboard than list, more tracking-tool than shopping-list.
Prompt held up. I still prefer the Claude version.

## Files

| File          | Role |
|---------------|------|
| `index.html`  | Page structure: add-item form, shopping list, rhythm panel |
| `styles.css`  | Visual design — receipt/ticket motif, rhythm color coding |
| `script.js`   | Data model, classification logic, UI wiring |
| `README.md`   | This file |

`script.js` is organized in build order, commented section by section:

1. Data model
2. Classification logic
3. UI/UX wiring

## 1. Data model

One shape, an `Item`:

```js
{
  id: string,              // stable unique id
  name: string,             // "Milk"
  category: string,         // "Dairy" — grouping only, not used in logic
  cadenceDays: number,      // this item's normal repurchase interval
  purchases: ["YYYY-MM-DD"],// full purchase history, oldest -> newest
  onList: boolean           // is it currently on the active shopping list?
}
```

No separate "shopping list" array. The list is just `items.filter(i =>
i.onList)`. Purchase history stays on the item permanently, even after it's
checked off. That's what makes "forgot to re-add" possible — an item not
on your list right now can still be judged against how long it's been
since you last bought it.

A small starter `CATALOG` ships with default cadences for common items
(milk, coffee, toilet paper), so typing "Milk" auto-suggests a 6-day
cadence instead of making you guess. Category and cadence can be
overridden on any item, catalog or custom.

## 2. Classification logic

This is the actual core of the brief, so here's the full reasoning.

**Core idea:** don't judge a purchase by a fixed day count. Judge it by the
ratio of the actual gap to that item's own normal cadence:

```
ratio = daysSinceLastPurchase / cadenceDays
```

A 6-day gap is exactly normal for milk (cadence 6) and clearly overbuying
for coffee (cadence 14). Same rule, both cases handled correctly, because
the ratio does the work.

**Zone bands**, from the ratio:

| Ratio range | Zone | Reasoning |
|---|---|---|
| < 0.50 | **Overbuying** | Bought again at under half the normal gap |
| 0.50 – 0.80 | **Borderline** | A bit sooner than usual — could just be an early trip |
| 0.80 – 1.15 | **Normal** | On pace. Real shopping doesn't land on the exact day |
| 1.15 – 1.60 | **Due soon** | Past the usual gap, probably running low |
| > 1.60 | **Probably forgotten** | Way past the usual gap — likely fell off the list |

The 0.80–1.15 band exists so normal behavior doesn't get flagged just for
missing an exact date. Checked against the brief's own worked examples:

| Item | Cadence | Gap | Ratio | Zone |
|---|---|---|---|---|
| Milk | 6–7d | 6d | 0.86–1.00 | Normal |
| Toilet paper | 21d | 20d | 0.95 | Normal |
| Coffee | 14d | 6d | 0.43 | Overbuying |
| Salt | 90d | 25d | 0.28 | Overbuying |
| Cereal | 10d | 7d | 0.70 | Borderline |
| Paper towels | 18d | 5d | 0.28 | Overbuying |

All six match.

**Two functions apply the same bands to two different questions:**

- `classifyLastPurchase(item)` — was the most recent restock too soon?
  Compares the gap between the last two purchases. Drives the toast after
  "Mark bought."
- `classifyCurrentStatus(item)` — how does the item look right now?
  Compares the last purchase to today. Drives the rhythm bar and, for
  items off the list, the "probably forgotten" suggestions.

No hard cutoff alarms. Each zone gets a specific, worded message ("bought
again at 43% of the usual gap") instead of a flat flag — closer to how the
brief frames this as a judgment call, not an automatic rule.

## 3. UI/UX

- **Add form** — type a name, common items auto-suggest a cadence.
  Category and cadence are optional overrides.
- **Shopping list** — active items as receipt-style tickets. "Mark bought"
  logs the purchase, removes it, shows a toast with that restock's
  classification.
- **Buying rhythm panel** — every item with purchase history gets a
  horizontal track split into the same zone bands, with a marker showing
  where it sits. Overbuying patterns show up at a glance, even for items
  not currently on the list.
- **"You might have forgotten these"** — a banner surfacing items in the
  *Due soon* / *Probably forgotten* zones, with a one-tap "Add back to
  list" button.

## Extending it

- **Auto-learn cadence:** cadence is fixed at creation right now. Natural
  next step — compute a rolling average of actual gaps and drift
  `cadenceDays` toward it over time.
- **Multi-user / sync:** swap the `Store` object's `localStorage` calls for
  a backend fetch. Nothing in the classification logic depends on storage.
- **Notifications:** `getReAddSuggestions(items)` already returns exactly
  what a push notification or email digest would need.
