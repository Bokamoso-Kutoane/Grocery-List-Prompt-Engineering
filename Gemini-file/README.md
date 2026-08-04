# Pantry Rhythm

A grocery list that tracks *how often* you actually buy something, and uses
that to do two things a plain checklist can't:

1. **Catch overbuying** — flag when you're repurchasing something way sooner
   than your own normal pace for it.
2. **Catch forgetting** — surface items that have quietly gone stale on your
   pantry shelf because you never re-added them to the list.

Everything runs client-side, no backend, no build step. Open `index.html`
in a browser and it works. Data persists in `localStorage`.

## Files

| File         | Role |
|--------------|------|
| `index.html` | Page structure: add-item form, shopping list, rhythm panel |
| `styles.css`  | Visual design — receipt/ticket motif, rhythm color coding |
| `script.js`     | Data model, classification logic, and UI wiring |
| `README.md`  | This file |

`script.js` is deliberately organized in the order it was built, and the file
itself is commented section-by-section:

1. **Data model**
2. **Classification logic**
3. **UI/UX wiring**

## 1. Data model

The whole app reasons about one shape, an `Item`:

```js
{
  id: string,              // stable unique id
  name: string,             // "Milk"
  category: string,         // "Dairy" — grouping only, not used in logic
  cadenceDays: number,      // this item's *normal* repurchase interval
  purchases: ["YYYY-MM-DD"],// full purchase history, oldest -> newest
  onList: boolean           // is it currently on the active shopping list?
}
```

Key design choice: **there's no separate "shopping list" array.** The
shopping list is just `items.filter(i => i.onList)`. Purchase history stays
on the item permanently, even after it's checked off and removed from the
list. That's what makes the "forgot to re-add" feature possible — an item
not on your list right now can still be evaluated against how long it's
been since you last bought it.

A small starter `CATALOG` ships with default cadences for common items
(milk, coffee, toilet paper, etc.), so adding "Milk" auto-suggests a 6-day
cadence instead of making you guess. You can override the category or
cadence for any item, catalog or custom, when you add it.

## 2. Classification logic

This is the part actually asked for in the brief, so here's the reasoning
in full.

**Core idea:** never judge a purchase by a fixed day count. Judge it by the
*ratio* of the actual gap to that item's own normal cadence:

```
ratio = daysSinceLastPurchase / cadenceDays
```

A 6-day gap is exactly normal for milk (cadence 6) and wildly overbuying
for coffee (cadence 14). The ratio is what makes both judgments correct
using the same rule.

**Zone bands**, from the ratio:

| Ratio range | Zone | Reasoning |
|---|---|---|
| < 0.50 | **Overbuying** | Bought again at under half the normal gap — clearly ahead of use |
| 0.50 – 0.80 | **Borderline** | A bit sooner than usual, but plausibly just a slightly early trip |
| 0.80 – 1.15 | **Normal** | Right on pace — real shopping trips don't land on the exact day |
| 1.15 – 1.60 | **Due soon** | Running past the usual gap, probably getting low |
| > 1.60 | **Probably forgotten** | Way past the usual gap — likely fell off the list |

The 0.80–1.15 "normal" band exists specifically so genuinely normal
behavior isn't flagged just for missing an exact date. Check it against
the brief's own worked examples:

| Item | Cadence | Gap | Ratio | Zone |
|---|---|---|---|---|
| Milk | 6–7d | 6d | 0.86–1.00 | Normal |
| Toilet paper | 21d | 20d | 0.95 | Normal |
| Coffee | 14d | 6d | 0.43 | Overbuying |
| Salt | 90d | 25d | 0.28 | Overbuying |
| Cereal | 10d | 7d | 0.70 | Borderline |
| Paper towels | 18d | 5d | 0.28 | Overbuying |

All six match the brief's stated judgment.

**Two functions apply the same bands to two different questions:**

- `classifyLastPurchase(item)` — was the *most recent restock* too soon?
  Compares the gap between the last two purchases. Powers the toast message
  you see right after tapping "Mark bought."
- `classifyCurrentStatus(item)` — how does the item look *right now*?
  Compares the gap between the last purchase and today. Powers the rhythm
  bar, and — for items not currently on the list — the "probably forgotten"
  suggestions.

Nothing here is a hard cutoff alarm; each zone comes with a specific,
worded message ("bought again at 43% of the usual gap") rather than a
plain flag, which is closer to how the brief frames this as a judgment
call rather than an automatic rule.

## 3. UI/UX

- **Add form** — type a name; common items auto-suggest a cadence via the
  catalog. Category and cadence are optional overrides.
- **Shopping list** — active items, styled as receipt-style tickets. "Mark
  bought" logs a purchase, removes it from the list, and immediately shows
  a toast with the classification of that restock.
- **Buying rhythm panel** — every item with purchase history gets a
  horizontal track split into the same zone bands, with a marker showing
  where it currently sits. This is where overbuying patterns become visible
  at a glance, even for items not on the list right now.
- **"You might have forgotten these"** — a banner above the list that
  surfaces items in the *Due soon* / *Probably forgotten* zones, with a
  one-tap "Add back to list" button.

## Extending it

- **Auto-learn cadence:** currently cadence is fixed at creation. A natural
  next step is computing a rolling average of actual gaps between
  purchases and drifting `cadenceDays` toward it over time.
- **Multi-user / sync:** swap the `Store` object's `localStorage` calls for
  a fetch to a backend — nothing else in the classification logic depends
  on storage.
- **Notifications:** `getReAddSuggestions(items)` already returns exactly
  the data a push notification or email digest would need.