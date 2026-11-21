// Trophy checklist view: builds one row per trophy once, then patches rows in
// place by id on every later render (only changed text/classes are touched).
// Clicks are delegated from the list container to the callback:
//   onSelect(id, 'select')        — a row was clicked / activated with Enter or Space
//   onSelect(id, 'toggle-earned') — the row's earned checkbox was toggled
import { isSpoilerHidden, maskedName, maskedDescription, chapterNumber } from './spoiler-shield.js';
import { ROADMAP_STAGES } from './roadmap-builder.js';
import { gradeLabel } from './trophy-data.js';

export const ROW_ACTIONS = { select: 'select', toggleEarned: 'toggle-earned' };

/**
 * Render the visible trophies (already filtered and sorted) into the container.
 * state: {sort, selectedId, kinds, ...}; rows are grouped by roadmap stage when sort = 'roadmap'.
 */
export function renderTrophyList(container, trophies, progress, state = {}, onSelect = () => {}) {
  const view = listViewFor(container);
  view.onSelect = onSelect;

  const groupByStage = (state.sort || 'roadmap') === 'roadmap';
  const order = [];
  const stageTotals = groupByStage ? countStageProgress(trophies, progress) : null;
  let lastStage = null;

  for (const trophy of trophies) {
    if (groupByStage && stageOf(trophy) !== lastStage) {
      lastStage = stageOf(trophy);
      order.push(patchStageHeader(view, lastStage, stageTotals.get(lastStage)));
    }
    let row = view.rows.get(trophy.id);
    if (!row) {
      row = createTrophyRow(trophy);
      view.rows.set(trophy.id, row);
    }
    patchTrophyRow(row, trophy, progress, state);
    order.push(row.el);
  }

  if (!trophies.length) order.push(patchEmptyState(view, state));
  placeNodesInOrder(container, order);
}

/** Bring one row up to date. Only properties whose value changed are written to the DOM. */
export function patchTrophyRow(row, trophy, progress, state = {}) {
  const next = rowModel(trophy, progress, state);
  const prev = row.last || {};
  const { el, refs } = row;

  if (next.grade !== prev.grade) {
    refs.icon.className = `grade-icon grade-${next.grade}`;
    refs.icon.title = next.gradeWord;
    refs.grade.className = `grade-label label-${next.grade}`;
    refs.grade.textContent = next.gradeWord;
  }
  if (next.name !== prev.name) refs.name.textContent = next.name;
  if (next.desc !== prev.desc) refs.desc.textContent = next.desc;
  if (next.masked !== prev.masked) el.classList.toggle('is-masked', next.masked);
  if (next.earned !== prev.earned) el.classList.toggle('is-earned', next.earned);
  // Always resync: a native click flips the box even when the app keeps the old state.
  if (refs.check.checked !== next.earned) refs.check.checked = next.earned;
  if (next.selected !== prev.selected) {
    el.classList.toggle('is-selected', next.selected);
    if (next.selected) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  }
  if (next.kind !== prev.kind) setChip(refs.kind, next.kind);
  if (next.chapter !== prev.chapter) setChip(refs.chapter, next.chapter);
  if (next.missable !== prev.missable) {
    refs.missable.hidden = !next.missable;
    refs.missable.textContent = next.missable === 'risk' ? 'MISSABLE RISK' : 'MISSABLE';
    refs.missable.classList.toggle('is-risk', next.missable === 'risk');
    refs.missable.title = next.missable === 'risk' ? 'Can be missed if you play past a certain point' : 'Can be permanently missed';
  }
  if (next.counter !== prev.counter) {
    refs.counter.hidden = !next.counter;
    refs.counterText.textContent = next.counter;
    refs.counterFill.style.width = `${next.counterPercent}%`;
  }
  if (next.label !== prev.label) {
    el.setAttribute('aria-label', next.label);
    refs.check.setAttribute('aria-label', `Mark “${next.name}” earned`);
  }
  row.last = next;
}

// ---------- row model & construction ----------

function rowModel(trophy, progress, state) {
  const masked = isSpoilerHidden(trophy, progress);
  const name = masked ? maskedName(trophy) : trophy.name;
  const count = Number(trophy.count) || 0;
  const have = count ? Math.min(count, Number(progress?.counters?.[trophy.id]) || 0) : 0;
  const earned = Boolean(progress?.earned?.[trophy.id]);
  const chapter = chapterNumber(trophy);
  const gradeWord = gradeLabel(trophy.grade);
  return {
    grade: trophy.grade,
    gradeWord,
    name,
    desc: masked ? maskedDescription(trophy) : trophy.description,
    masked,
    earned,
    selected: state.selectedId != null && Number(state.selectedId) === trophy.id,
    kind: trophy.kind && trophy.kind !== 'misc' ? trophy.kind : '',
    chapter: chapter != null ? `ch ${chapter}` : '',
    missable: trophy.missable === true ? 'missable' : trophy.missable === 'risk' ? 'risk' : '',
    counter: count ? `${earned ? count : have} / ${count}` : '',
    counterPercent: count ? Math.round(((earned ? count : have) / count) * 100) : 0,
    label: `${name}, ${gradeWord}${earned ? ', earned' : ''}`,
  };
}

function createTrophyRow(trophy) {
  const el = document.createElement('div');
  el.className = 'trophy-row';
  el.dataset.id = String(trophy.id);
  el.tabIndex = 0;

  const icon = document.createElement('i');
  const main = make('div', 'row-main');
  const name = make('div', 'row-name');
  const desc = make('div', 'row-desc');
  main.append(name, desc);

  const meta = make('div', 'row-meta');
  const missable = make('span', 'missable-flag');
  const kind = make('span', 'kind-chip');
  const chapter = make('span', 'kind-chip chapter-chip');
  const counter = make('span', 'row-counter');
  const counterText = make('span', 'counter-text');
  const counterBar = make('span', 'counter-bar');
  const counterFill = document.createElement('i');
  counterBar.append(counterFill);
  counter.append(counterText, counterBar);
  const grade = make('span', 'grade-label');
  meta.append(missable, counter, kind, chapter, grade);

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'earned-check';
  check.dataset.action = ROW_ACTIONS.toggleEarned;

  el.append(icon, main, meta, check);
  return { el, refs: { icon, name, desc, missable, kind, chapter, counter, counterText, counterFill, grade, check }, last: null };
}

function setChip(chip, text) {
  chip.textContent = text;
  chip.hidden = !text;
}

function make(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

// ---------- group headers & empty state ----------

function patchStageHeader(view, stage, totals = { done: 0, total: 0 }) {
  let header = view.headers.get(stage);
  if (!header) {
    header = make('h3', 'list-group-title');
    header.dataset.stage = String(stage);
    view.headers.set(stage, header);
  }
  const def = ROADMAP_STAGES.find((s) => s.stage === stage);
  const text = `Stage ${stage} · ${def ? def.title : 'Other trophies'} · ${totals.done}/${totals.total}`;
  if (header.textContent !== text) header.textContent = text;
  return header;
}

function patchEmptyState(view, state) {
  if (!view.empty) view.empty = make('p', 'list-empty');
  const kinds = state.kinds instanceof Set ? [...state.kinds] : [...(state.kinds || [])];
  const text = kinds.length === 1 && kinds[0] === 'online'
    ? 'No online trophies — every GTA VI trophy is earned in single-player.'
    : state.query
      ? `No trophy matches “${state.query}”. Try a mission name, a collectible or clear the filters.`
      : 'No trophies match these filters.';
  if (view.empty.textContent !== text) view.empty.textContent = text;
  return view.empty;
}

function countStageProgress(trophies, progress) {
  const totals = new Map();
  for (const t of trophies) {
    const s = stageOf(t);
    const entry = totals.get(s) || { done: 0, total: 0 };
    entry.total += 1;
    if (progress?.earned?.[t.id]) entry.done += 1;
    totals.set(s, entry);
  }
  return totals;
}

function stageOf(trophy) {
  const n = Math.round(Number(trophy.stage));
  return n >= 1 && n <= 5 ? n : 5;
}

// ---------- container bookkeeping ----------

const listViews = new WeakMap();

function listViewFor(container) {
  let view = listViews.get(container);
  if (!view) {
    view = { rows: new Map(), headers: new Map(), empty: null, onSelect: () => {} };
    listViews.set(container, view);
    attachDelegatedEvents(container, view);
  }
  return view;
}

function attachDelegatedEvents(container, view) {
  container.addEventListener('click', (event) => {
    const row = event.target.closest('.trophy-row');
    if (!row || !container.contains(row)) return;
    const id = Number(row.dataset.id);
    if (event.target.closest('[data-action="toggle-earned"]')) view.onSelect(id, ROW_ACTIONS.toggleEarned);
    else view.onSelect(id, ROW_ACTIONS.select);
  });
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest?.('.trophy-row');
    if (!row || event.target !== row) return;
    event.preventDefault();
    view.onSelect(Number(row.dataset.id), ROW_ACTIONS.select);
  });
}

/** Move nodes into the wanted order with few DOM moves; detach everything else (rows stay cached for reuse, the loading line goes). */
function placeNodesInOrder(container, order) {
  const wanted = new Set(order);
  for (const child of [...container.children]) if (!wanted.has(child)) child.remove();
  let cursor = container.firstElementChild;
  for (const node of order) {
    if (node === cursor) {
      cursor = cursor.nextElementSibling;
    } else {
      container.insertBefore(node, cursor);
    }
  }
}
