// Platinum roadmap view: five stage cards (progress bar + trophy chips) and the
// "Missable & one-time" panel, plus the compact missables strip in the filter column.
// Trophy names respect the spoiler shield. Clicking a chip or missable calls onSelect(id).
import { isSpoilerHidden, maskedName, chapterNumber } from './spoiler-shield.js';
import { gradeLabel } from './trophy-data.js';

/**
 * Render the roadmap into `el`.
 * stages: from buildPlatinumRoadmap(); missables: from listMissables().
 * options: {trophiesById: Map<id, trophy>, progress, selectedId, onSelect(id)}.
 */
export function renderRoadmapView(el, stages, missables, options = {}) {
  const ctx = viewContext(el, options);
  const frag = document.createDocumentFragment();
  const done = stages.reduce((n, s) => n + s.done, 0);
  const total = stages.reduce((n, s) => n + s.total, 0);

  const intro = make('p', 'roadmap-intro');
  intro.textContent = `Five stages from the opening chapter to the platinum · ${done}/${total} trophies done. Read the missable panel before you start each chapter.`;
  frag.append(intro, missablePanel(missables, ctx));
  for (const stage of stages) frag.append(stageCard(stage, ctx));
  el.replaceChildren(frag);
}

/** Compact missable warnings for the filter column (#missables-strip). */
export function renderMissablesStrip(el, missables, options = {}) {
  const ctx = viewContext(el, options);
  if (!missables.length) { el.replaceChildren(); return; }
  const title = make('p', 'missables-title');
  title.textContent = `Missable · ${missables.length}`;
  const items = missables.map((m) => {
    const trophy = ctx.trophiesById.get(m.id);
    const button = make('button', 'missable-item');
    button.type = 'button';
    button.dataset.trophyId = String(m.id);
    const name = make('b', '');
    name.textContent = trophyName(trophy, m, ctx.progress);
    const where = make('small', '');
    where.textContent = `${m.risk === 'risk' ? 'Risk' : 'Missable'} · ${chapterText(trophy, m, ctx.progress) || 'any time'}`;
    button.append(name, where);
    return button;
  });
  el.replaceChildren(title, ...items);
}

/** Sidebar summary of the five stages (number, title, done/total as a filled row); a click opens the roadmap tab. */
export function renderRoadmapProgress(el, stages) {
  const title = text('a', 'roadmap-mini-title', `Platinum roadmap · ${stages.length} stages`);
  title.href = '#/roadmap';
  const items = stages.map((stage) => {
    const link = make('a', 'roadmap-mini-stage');
    link.href = '#/roadmap';
    link.classList.toggle('is-done', stage.total > 0 && stage.done === stage.total);
    link.style.setProperty('--done', `${stage.total ? Math.round((stage.done / stage.total) * 100) : 0}%`);
    link.append(
      text('b', 'roadmap-mini-number', String(stage.stage)),
      text('span', 'roadmap-mini-name', stage.title.split(' — ')[0]),
      text('small', 'roadmap-mini-count', `${stage.done}/${stage.total}`),
    );
    return link;
  });
  el.replaceChildren(title, ...items);
}

// ---------- stage cards ----------

function stageCard(stage, ctx) {
  const card = make('section', 'roadmap-stage');
  card.classList.toggle('is-done', stage.total > 0 && stage.done === stage.total);
  card.dataset.stage = String(stage.stage);

  const head = make('header', 'stage-head');
  head.append(
    text('span', 'stage-number', String(stage.stage)),
    text('h3', 'stage-title', stage.title),
    text('span', 'stage-count', `${stage.done}/${stage.total}`),
  );

  const bar = make('div', 'stage-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', `Stage ${stage.stage} progress`);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(stage.total));
  bar.setAttribute('aria-valuenow', String(stage.done));
  const fill = make('i', '');
  fill.style.width = `${stage.total ? Math.round((stage.done / stage.total) * 100) : 0}%`;
  bar.append(fill);

  const chips = make('div', 'stage-trophies');
  for (const id of stage.trophyIds) {
    const trophy = ctx.trophiesById.get(id);
    if (trophy) chips.append(trophyChip(trophy, ctx));
  }
  card.append(head, text('p', 'stage-summary', stage.summary), bar, chips);
  return card;
}

function trophyChip(trophy, ctx) {
  const chip = make('button', 'stage-trophy');
  chip.type = 'button';
  chip.dataset.trophyId = String(trophy.id);
  const earned = Boolean(ctx.progress?.earned?.[trophy.id]);
  const masked = isSpoilerHidden(trophy, ctx.progress);
  chip.classList.toggle('is-earned', earned);
  chip.classList.toggle('is-masked', masked);
  chip.classList.toggle('is-missable', trophy.missable === true || trophy.missable === 'risk');
  chip.classList.toggle('is-selected', Number(ctx.selectedId) === trophy.id);
  const icon = make('i', `grade-icon grade-${trophy.grade}`);
  icon.title = gradeLabel(trophy.grade);
  const name = masked ? maskedName(trophy) : trophy.name;
  chip.append(icon, text('span', 'stage-trophy-name', name));
  if (earned) chip.append(text('span', 'stage-trophy-check', '✓'));
  chip.title = `${name} · ${gradeLabel(trophy.grade)}${earned ? ' · earned' : ''}`;
  return chip;
}

// ---------- missable panel ----------

function missablePanel(missables, ctx) {
  const panel = make('section', 'roadmap-missables');
  panel.append(text('h3', 'roadmap-missables-title', `Missable & one-time · ${missables.length}`));
  if (!missables.length) {
    panel.append(text('p', 'roadmap-missables-empty', 'Nothing in this list can be permanently missed.'));
    return panel;
  }
  const list = make('ol', 'roadmap-missables-list');
  for (const m of missables) {
    const trophy = ctx.trophiesById.get(m.id);
    const masked = isSpoilerHidden(trophy, ctx.progress);
    const item = make('li', `roadmap-missable${m.risk === 'risk' ? ' is-risk' : ''}`);
    item.classList.toggle('is-earned', Boolean(ctx.progress?.earned?.[m.id]));
    const button = make('button', 'roadmap-missable-open');
    button.type = 'button';
    button.dataset.trophyId = String(m.id);
    button.append(
      text('span', `missable-flag${m.risk === 'risk' ? ' is-risk' : ''}`, m.risk === 'risk' ? 'RISK' : 'MISSABLE'),
      text('b', 'roadmap-missable-name', trophyName(trophy, m, ctx.progress)),
      text('span', 'kind-chip chapter-chip', chapterText(trophy, m, ctx.progress) || 'any time'),
    );
    const note = masked
      ? 'Spoiler hidden — open it to reveal when and how to avoid missing it.'
      : m.note || 'Can be missed; check the guide before moving on.';
    item.append(button, text('p', 'roadmap-missable-note', note));
    list.append(item);
  }
  panel.append(list);
  return panel;
}

// ---------- helpers ----------

function trophyName(trophy, missable, progress) {
  if (!trophy) return missable.name;
  return isSpoilerHidden(trophy, progress) ? maskedName(trophy) : trophy.name;
}

/** Full chapter label, or only "Chapter N" while the trophy is spoiler-masked. */
function chapterText(trophy, missable, progress) {
  const chapter = missable.chapter || trophy?.chapter || '';
  if (!chapter) return '';
  if (trophy && isSpoilerHidden(trophy, progress)) {
    const n = chapterNumber(trophy);
    return n != null ? `Chapter ${n}` : 'Story';
  }
  return chapter;
}

const contexts = new WeakMap();

/** Remember the latest options per container and attach one delegated click handler. */
function viewContext(el, options) {
  let ctx = contexts.get(el);
  if (!ctx) {
    ctx = {};
    contexts.set(el, ctx);
    el.addEventListener('click', (event) => {
      const target = event.target.closest('[data-trophy-id]');
      if (target && el.contains(target)) ctx.onSelect?.(Number(target.dataset.trophyId));
    });
  }
  Object.assign(ctx, {
    trophiesById: options.trophiesById || new Map(),
    progress: options.progress || {},
    selectedId: options.selectedId ?? null,
    onSelect: options.onSelect,
  });
  return ctx;
}

function make(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function text(tag, className, value) {
  const node = make(tag, className);
  node.textContent = value;
  return node;
}
