/* =========================================================================
   PANTRY RHYTHM — app.js
   Order of construction (matches the brief):
     1. Data model
     2. Classification logic
     3. UI/UX wiring (bottom of file)
   ========================================================================= */

/* -------------------------------------------------------------------------
   1. DATA MODEL
   -------------------------------------------------------------------------
   An Item is the single unit the whole app reasons about.

   Item = {
     id: string,              // stable unique id
     name: string,            // "Milk"
     category: string,        // "Dairy" — used for grouping only
     cadenceDays: number,     // how often this normally gets bought
     purchases: [ "YYYY-MM-DD", ... ],  // sorted oldest -> newest
     onList: boolean          // currently sitting on the active shopping list
   }

   We don't store a separate "shopping list" array. The shopping list is just
   items where onList === true. Purchase history lives permanently on the
   item, which is what lets us compute rhythm even for items that are
   currently NOT on the list (that's how we catch "forgot to re-add").
   ------------------------------------------------------------------------- */

const STORAGE_KEY = 'pantry-rhythm:v1';

// Starter catalog: common items with a sensible default cadence, in days.
// A user can add anything else with a custom cadence — this just saves
// typing for the everyday stuff and mirrors the worked examples in the brief.
const CATALOG = [
  { name: 'Milk', category: 'Dairy', cadenceDays: 6 },
  { name: 'Eggs', category: 'Dairy', cadenceDays: 10 },
  { name: 'Bread', category: 'Bakery', cadenceDays: 6 },
  { name: 'Coffee', category: 'Pantry', cadenceDays: 14 },
  { name: 'Cereal', category: 'Pantry', cadenceDays: 10 },
  { name: 'Salt', category: 'Pantry', cadenceDays: 90 },
  { name: 'Sugar', category: 'Pantry', cadenceDays: 45 },
  { name: 'Toilet Paper', category: 'Household', cadenceDays: 21 },
  { name: 'Paper Towels', category: 'Household', cadenceDays: 18 },
  { name: 'Dish Soap', category: 'Household', cadenceDays: 30 },
  { name: 'Laundry Detergent', category: 'Household', cadenceDays: 35 },
  { name: 'Bananas', category: 'Produce', cadenceDays: 7 },
  { name: 'Chicken Breast', category: 'Meat', cadenceDays: 8 },
];

function makeId() {
  return 'i_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const MS_DAY = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b) - new Date(a)) / MS_DAY);
}

/** Create a fresh item. purchases starts empty — an item only gets rhythm
 *  data once it's actually been bought at least twice. */
function createItem({ name, category, cadenceDays }) {
  return {
    id: makeId(),
    name: name.trim(),
    category: category || 'Other',
    cadenceDays: Number(cadenceDays) || 14,
    purchases: [],
    onList: true,
  };
}

/** Record a purchase "now" (or on a given date) and take it off the list. */
function logPurchase(item, dateStr = todayStr()) {
  item.purchases.push(dateStr);
  item.purchases.sort();
  item.onList = false;
  return item;
}

const Store = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  },
};

/* -------------------------------------------------------------------------
   2. CLASSIFICATION LOGIC
   -------------------------------------------------------------------------
   Everything here is judged as a RATIO of "days since last purchase" over
   "this item's normal cadence" — not a fixed day count — because a 6-day
   gap means something totally different for milk (cadence 6) than for
   coffee (cadence 14). This directly encodes the worked examples:

     Milk           6 / 6   = 1.00  -> normal
     Toilet paper   20 / 21 = 0.95  -> normal
     Coffee         6 / 14  = 0.43  -> overbuying
     Salt           25 / 90 = 0.28  -> overbuying
     Cereal         7 / 10  = 0.70  -> borderline
     Paper towels   5 / 18  = 0.28  -> overbuying

   Zone bands (ratio = gap / cadence):
     <  0.50            overbuying   "well under half the normal gap"
     0.50 – 0.80        borderline   "a bit sooner, not a clear overbuy"
     0.80 – 1.15        normal       "right on pace"
     1.15 – 1.60        due          "getting low, worth restocking"
     >  1.60             forgotten   "well past normal — likely forgot"

   The 0.80–1.15 "normal" band is intentionally wide: real shopping trips
   don't land on the exact day, and the brief's own normal examples (0.86
   and 0.95) both sit comfortably inside it without being flagged.
   ------------------------------------------------------------------------- */

const ZONES = {
  OVERBUY: 'overbuy',
  BORDERLINE: 'borderline',
  NORMAL: 'normal',
  DUE: 'due',
  FORGOTTEN: 'forgotten',
};

const ZONE_META = {
  overbuy: { label: 'Overbuying', tone: 'alert', color: 'var(--rust)' },
  borderline: { label: 'Borderline', tone: 'caution', color: 'var(--mustard)' },
  normal: { label: 'Normal pace', tone: 'ok', color: 'var(--pantry)' },
  due: { label: 'Due soon', tone: 'caution', color: 'var(--mustard)' },
  forgotten: { label: 'Probably forgotten', tone: 'alert', color: 'var(--rust)' },
};

/** Core judgment call. Returns a zone + a short, specific message —
 *  never a bare "flagged" — because the brief asks for judgment, not
 *  a hard cutoff alarm. */
function classifyRatio(ratio) {
  if (ratio < 0.5) {
    return {
      zone: ZONES.OVERBUY,
      message: `Bought again at ${Math.round(ratio * 100)}% of the usual gap — well ahead of when this normally runs out.`,
    };
  }
  if (ratio < 0.8) {
    return {
      zone: ZONES.BORDERLINE,
      message: `A bit sooner than usual (${Math.round(ratio * 100)}% of the normal gap) — not a clear overbuy, worth a second look if it keeps happening.`,
    };
  }
  if (ratio <= 1.15) {
    return {
      zone: ZONES.NORMAL,
      message: `Right on the usual rhythm (${Math.round(ratio * 100)}% of the normal gap).`,
    };
  }
  if (ratio <= 1.6) {
    return {
      zone: ZONES.DUE,
      message: `Running a bit past the usual gap (${Math.round(ratio * 100)}%) — probably getting low.`,
    };
  }
  return {
    zone: ZONES.FORGOTTEN,
    message: `Way past the usual gap (${Math.round(ratio * 100)}%) — this one's likely just been forgotten.`,
  };
}

/** Judge the most recent purchase against the one before it. Returns null
 *  if there isn't enough history yet (need at least 2 purchases). */
function classifyLastPurchase(item) {
  if (item.purchases.length < 2) return null;
  const n = item.purchases.length;
  const gap = daysBetween(item.purchases[n - 2], item.purchases[n - 1]);
  const ratio = gap / item.cadenceDays;
  return { gapDays: gap, ratio, ...classifyRatio(ratio) };
}

/** Judge current pantry status for an item that is NOT on the list right
 *  now, based on days since its last purchase vs. today. This is what
 *  powers "you probably forgot to re-add this" suggestions. */
function classifyCurrentStatus(item, today = todayStr()) {
  if (item.purchases.length === 0) return null;
  const last = item.purchases[item.purchases.length - 1];
  const gap = daysBetween(last, today);
  const ratio = gap / item.cadenceDays;
  return { gapDays: gap, ratio, ...classifyRatio(ratio) };
}

/** Full-list scan for "forgot to re-add" suggestions: items with purchase
 *  history, not currently on the list, sitting in the DUE or FORGOTTEN zone. */
function getReAddSuggestions(items) {
  return items
    .filter((it) => !it.onList && it.purchases.length > 0)
    .map((it) => ({ item: it, status: classifyCurrentStatus(it) }))
    .filter((r) => r.status && (r.status.zone === ZONES.DUE || r.status.zone === ZONES.FORGOTTEN))
    .sort((a, b) => b.status.ratio - a.status.ratio);
}

/* -------------------------------------------------------------------------
   3. UI / UX WIRING
   ------------------------------------------------------------------------- */

let items = Store.load();
if (!items) {
  items = [];
  Store.save(items);
}

function persist() {
  Store.save(items);
}

function findItem(id) {
  return items.find((it) => it.id === id);
}

/* ---- rendering ---- */

const listEl = document.getElementById('shopping-list');
const rhythmEl = document.getElementById('rhythm-list');
const suggestionsPanel = document.getElementById('suggestions');
const suggestionsEl = document.getElementById('suggestions-body');
const emptyListEl = document.getElementById('empty-list');
const nameInput = document.getElementById('item-name');
const categoryInput = document.getElementById('item-category');
const cadenceInput = document.getElementById('item-cadence');
const form = document.getElementById('add-form');
const datalist = document.getElementById('catalog-options');
const toastEl = document.getElementById('toast');

function fillCatalogDatalist() {
  datalist.innerHTML = CATALOG.map((c) => `<option value="${c.name}">`).join('');
}

function catalogDefaultsFor(name) {
  const hit = CATALOG.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  return hit || null;
}

function showToast(msg, tone = 'ok') {
  toastEl.textContent = msg;
  toastEl.dataset.tone = tone;
  toastEl.classList.add('is-visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('is-visible'), 4200);
}

function renderAll() {
  renderShoppingList();
  renderRhythm();
  renderSuggestions();
}

function renderShoppingList() {
  const onList = items.filter((it) => it.onList);
  listEl.innerHTML = '';
  emptyListEl.hidden = onList.length !== 0;

  onList.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'ticket';

    const last = item.purchases[item.purchases.length - 1];
    const sub = last
      ? `every ~${item.cadenceDays}d · last bought ${daysBetween(last, todayStr())}d ago`
      : `every ~${item.cadenceDays}d · no history yet`;

    li.innerHTML = `
      <div class="ticket__main">
        <span class="ticket__name">${escapeHtml(item.name)}</span>
        <span class="ticket__sub">${escapeHtml(item.category)} · ${sub}</span>
      </div>
      <div class="ticket__actions">
        <button class="btn btn--buy" data-action="buy" data-id="${item.id}">Mark bought</button>
        <button class="btn btn--ghost" data-action="remove" data-id="${item.id}" aria-label="Remove ${escapeHtml(item.name)} from list">✕</button>
      </div>
    `;
    listEl.appendChild(li);
  });
}

function renderRhythm() {
  const tracked = items.filter((it) => it.purchases.length > 0);
  rhythmEl.innerHTML = '';

  if (tracked.length === 0) {
    rhythmEl.innerHTML = `<p class="muted">Mark a couple of purchases and each item's buying rhythm will show up here.</p>`;
    return;
  }

  tracked.forEach((item) => {
    const status = classifyCurrentStatus(item);
    const lastJudged = classifyLastPurchase(item);
    const ratio = status ? status.ratio : 0;
    const pct = Math.max(2, Math.min(100, ratio * (100 / 1.6))); // scale so 1.6x cadence = track end

    const row = document.createElement('div');
    row.className = 'rhythm-row';
    row.innerHTML = `
      <div class="rhythm-row__head">
        <span class="rhythm-row__name">${escapeHtml(item.name)}</span>
        <span class="tag tag--${status.zone}">${ZONE_META[status.zone].label}</span>
      </div>
      <div class="rhythm-track" title="${status.gapDays}d since last purchase · cadence ${item.cadenceDays}d">
        <div class="rhythm-track__zone rhythm-track__zone--overbuy"></div>
        <div class="rhythm-track__zone rhythm-track__zone--borderline"></div>
        <div class="rhythm-track__zone rhythm-track__zone--normal"></div>
        <div class="rhythm-track__zone rhythm-track__zone--due"></div>
        <div class="rhythm-track__marker" style="left:${pct}%"></div>
      </div>
      <p class="rhythm-row__msg">${status.message}${lastJudged && lastJudged.zone !== status.zone ? ` <span class="muted">(last restock: ${ZONE_META[lastJudged.zone].label.toLowerCase()})</span>` : ''}</p>
    `;
    rhythmEl.appendChild(row);
  });
}

function renderSuggestions() {
  const suggestions = getReAddSuggestions(items);
  suggestionsEl.innerHTML = '';

  if (suggestions.length === 0) {
    suggestionsPanel.hidden = true;
    return;
  }
  suggestionsPanel.hidden = false;

  suggestions.forEach(({ item, status }) => {
    const card = document.createElement('div');
    card.className = `suggestion suggestion--${status.zone}`;
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="muted">${status.gapDays}d since last bought · usually every ${item.cadenceDays}d</span>
      </div>
      <button class="btn btn--add" data-action="readd" data-id="${item.id}">Add back to list</button>
    `;
    suggestionsEl.appendChild(card);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* ---- events ---- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  const existing = items.find((it) => it.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.onList = true;
    if (categoryInput.value.trim()) existing.category = categoryInput.value.trim();
    if (cadenceInput.value) existing.cadenceDays = Number(cadenceInput.value);
  } else {
    const preset = catalogDefaultsFor(name);
    items.push(
      createItem({
        name,
        category: categoryInput.value.trim() || (preset ? preset.category : 'Other'),
        cadenceDays: cadenceInput.value ? Number(cadenceInput.value) : (preset ? preset.cadenceDays : 14),
      })
    );
  }

  persist();
  renderAll();
  form.reset();
  nameInput.focus();
});

nameInput.addEventListener('input', () => {
  const preset = catalogDefaultsFor(nameInput.value);
  if (preset && !cadenceInput.value) cadenceInput.placeholder = `~${preset.cadenceDays} days`;
  if (preset && !categoryInput.value) categoryInput.placeholder = preset.category;
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const item = findItem(btn.dataset.id);
  if (!item) return;

  if (btn.dataset.action === 'buy') {
    logPurchase(item);
    const judged = classifyLastPurchase(item);
    persist();
    renderAll();
    if (judged) {
      const tone = ZONE_META[judged.zone].tone;
      showToast(`${item.name}: ${judged.message}`, tone);
    } else {
      showToast(`${item.name} logged. Buy it once more and rhythm tracking kicks in.`, 'ok');
    }
  }

  if (btn.dataset.action === 'remove') {
    item.onList = false;
    persist();
    renderAll();
  }

  if (btn.dataset.action === 'readd') {
    item.onList = true;
    persist();
    renderAll();
    showToast(`${item.name} added back to your list.`, 'ok');
  }
});

fillCatalogDatalist();
renderAll();