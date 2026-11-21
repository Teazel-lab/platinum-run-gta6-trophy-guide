// Guide pane for one trophy. Order: header, "When" line, missable warning, the cited
// Sources (always visible without scrolling), numbered steps, our guide text, tips and
// the mark-earned button; count trophies get a counter stepper in the grade row.
// User actions call the optional `actions` callbacks and also bubble a
// 'guide-action' CustomEvent ({detail:{action, id, value}}) from the panel element.
import { isSpoilerHidden, maskedName, maskedDescription, isStoryTrophy } from './spoiler-shield.js';
import { ROADMAP_STAGES } from './roadmap-builder.js';
import { GRADE_POINTS, gradeLabel } from './trophy-data.js';

export const GUIDE_ACTIONS = { toggleEarned: 'toggle-earned', setCounter: 'set-counter', reveal: 'reveal' };

/**
 * Render the guide for `trophy` (or the "pick a trophy" state when null).
 * actions: {onToggleEarned(id), onSetCounter(id, n), onReveal(id)} — all optional.
 */
export function renderGuidePanel(el, trophy, sources = {}, progress = {}, actions = {}) {
  const sameTrophy = trophy && el.dataset.trophyId === String(trophy.id);
  const scrollTop = sameTrophy ? el.scrollTop : 0;
  el.replaceChildren(trophy ? buildGuide(el, trophy, sources, progress, actions) : buildEmptyGuide());
  el.dataset.trophyId = trophy ? String(trophy.id) : '';
  el.scrollTop = scrollTop;
}

/** Show a spoiler-masked trophy in this pane for the rest of the session. */
export function revealInGuidePanel(id) {
  revealedIds.add(Number(id));
}

const revealedIds = new Set();

function buildGuide(panel, trophy, sources, progress, actions) {
  const masked = isSpoilerHidden(trophy, progress) && !revealedIds.has(trophy.id);
  const earned = Boolean(progress?.earned?.[trophy.id]);
  const send = (action, value) => emitAction(panel, actions, action, trophy, value);
  const frag = document.createDocumentFragment();

  const meta = guideMeta(trophy, earned);
  if (Number(trophy.count) > 0) meta.append(counterStepper(trophy, progress, earned, (n) => send(GUIDE_ACTIONS.setCounter, n)));
  frag.append(guideHeader(trophy, masked), meta, whenLine(trophy, masked));

  if (masked) {
    if (trophy.missable === true || trophy.missable === 'risk') frag.append(missableBox(trophy, true));
    frag.append(revealCard(trophy, () => {
      revealedIds.add(trophy.id);
      send(GUIDE_ACTIONS.reveal);
      renderGuidePanel(panel, trophy, sources, progress, actions);
    }));
  } else {
    if (trophy.missable === true || trophy.missable === 'risk') frag.append(missableBox(trophy, false));
    frag.append(sourcesCard(trophy.cite, sources));
    if (trophy.steps?.length) frag.append(card('Steps', listEl('ol', 'guide-steps', trophy.steps), 'guide-steps-card'));
    if (trophy.guide) frag.append(card('Our guide', textEl('p', 'guide-text', trophy.guide), 'guide-ours'));
    if (trophy.tips?.length) frag.append(card('Tips', listEl('ul', 'guide-tips', trophy.tips), 'guide-tips-card'));
  }

  frag.append(earnedButton(earned, () => send(GUIDE_ACTIONS.toggleEarned)));
  return frag;
}

// ---------- header ----------

function guideHeader(trophy, masked) {
  const head = el('header', 'guide-head');
  const icon = el('i', `grade-icon grade-${trophy.grade}`);
  icon.title = gradeLabel(trophy.grade);
  const text = el('div', 'guide-head-text');
  const title = textEl('h2', masked ? 'guide-title masked-text' : 'guide-title', masked ? maskedName(trophy) : trophy.name);
  if (masked) title.classList.add('masked-lock');
  const desc = textEl('p', 'guide-desc', masked ? maskedDescription(trophy) : trophy.description);
  text.append(title, desc);
  head.append(icon, text);
  return head;
}

function guideMeta(trophy, earned) {
  const meta = el('div', 'guide-meta');
  const points = GRADE_POINTS[trophy.grade];
  meta.append(textEl('span', `grade-label label-${trophy.grade} guide-grade`, `${gradeLabel(trophy.grade)}${points ? ` · ${points} pts` : ''}`));
  if (trophy.hidden) {
    const badge = textEl('span', 'guide-badge guide-badge-hidden', 'PlayStation hidden');
    badge.title = 'Listed as a hidden trophy on PlayStation';
    meta.append(badge);
  }
  if (earned) meta.append(textEl('span', 'guide-badge guide-badge-earned', 'Earned'));
  return meta;
}

function whenLine(trophy, masked) {
  const stage = ROADMAP_STAGES.find((s) => s.stage === Number(trophy.stage));
  const parts = [];
  if (trophy.chapter) parts.push(masked ? chapterOnly(trophy.chapter) : trophy.chapter);
  else if (!isStoryTrophy(trophy)) parts.push('Any time');
  if (stage) parts.push(`Roadmap stage ${stage.stage}: ${stage.title}`);
  const line = el('p', 'guide-when');
  line.append(textEl('b', 'guide-when-label', 'When '), document.createTextNode(parts.join(' · ')));
  return line;
}

/** "Chapter 2 · Breakfast Run" -> "Chapter 2" so a masked trophy keeps no mission name. */
function chapterOnly(chapter) {
  const m = /chapter\s*\d+/i.exec(chapter);
  return m ? m[0] : 'Story';
}

// ---------- warning, reveal, sources ----------

function missableBox(trophy, masked) {
  const risk = trophy.missable === 'risk';
  const box = card(risk ? 'Missable risk' : 'Missable', null, risk ? 'guide-warning is-risk' : 'guide-warning');
  const note = masked
    ? 'This one can be missed. Reveal the trophy to read exactly when and how.'
    : trophy.missableNote || (risk ? 'Can be missed if you play past the moment it belongs to.' : 'Can be missed permanently on this save.');
  box.append(textEl('p', 'guide-warning-text', note));
  return box;
}

function revealCard(trophy, onReveal) {
  const box = card('Story spoiler hidden', null, 'guide-reveal');
  box.append(textEl('p', 'guide-text', 'The name, guide and sources for this story trophy stay hidden until you earn it, so the plot stays fresh.'));
  const waiting = [`${trophy.steps?.length || 0} steps`, `${trophy.cite?.length || 0} cited sources`, trophy.tips?.length ? `${trophy.tips.length} tips` : ''].filter(Boolean);
  box.append(textEl('p', 'guide-reveal-waiting', `Ready behind the shield: ${waiting.join(' · ')}.`));
  const button = textEl('button', 'btn guide-reveal-button', 'Reveal this trophy');
  button.type = 'button';
  button.addEventListener('click', onReveal);
  box.append(button);
  return box;
}

function sourcesCard(citeKeys = [], sources = {}) {
  const box = card('Sources', null, 'guide-sources');
  const list = el('ul', 'source-list');
  for (const key of citeKeys || []) {
    const source = sources[key];
    const href = safeUrl(source?.url);
    if (!href) continue;
    const a = el('a', 'source-link');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = `${source.name} — opens in a new tab`;
    a.append(textEl('span', 'source-name', source.name), textEl('small', 'source-domain', domainOf(href)));
    const li = el('li', 'source-item');
    li.append(a);
    list.append(li);
  }
  if (!list.children.length) box.append(textEl('p', 'guide-tips', 'No sources cited yet for this trophy.'));
  else box.append(list);
  return box;
}

function safeUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

function domainOf(href) {
  return new URL(href).hostname.replace(/^www\./, '');
}

// ---------- counter & earned ----------

function counterStepper(trophy, progress, earned, onSet) {
  const count = Number(trophy.count);
  const value = earned ? count : Math.min(count, Number(progress?.counters?.[trophy.id]) || 0);
  const box = el('div', 'guide-counter');
  box.append(textEl('span', 'guide-counter-label', 'Progress'));
  const row = el('div', 'counter-stepper');
  const minus = stepButton('−', `Decrease ${trophy.name} count`);
  const plus = stepButton('+', `Increase ${trophy.name} count`);
  const input = el('input', 'counter-input');
  Object.assign(input, { type: 'number', min: '0', max: String(count), value: String(value), inputMode: 'numeric' });
  input.setAttribute('aria-label', `Collected so far, out of ${count}`);
  const commit = (n) => {
    const clamped = Math.max(0, Math.min(count, Math.round(Number(n) || 0)));
    input.value = String(clamped);
    onSet(clamped);
  };
  minus.addEventListener('click', () => commit(Number(input.value) - 1));
  plus.addEventListener('click', () => commit(Number(input.value) + 1));
  input.addEventListener('change', () => commit(input.value));
  row.append(minus, input, textEl('span', 'counter-of', `/ ${count}`), plus);
  box.append(row);
  return box;
}

function stepButton(label, ariaLabel) {
  const b = textEl('button', 'counter-step', label);
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel);
  return b;
}

function earnedButton(earned, onToggle) {
  const b = textEl('button', `btn guide-earned-toggle${earned ? ' is-earned' : ''}`, earned ? '✓ Earned — undo' : 'Mark as earned');
  b.type = 'button';
  b.setAttribute('aria-pressed', String(earned));
  b.addEventListener('click', onToggle);
  return b;
}

function emitAction(panel, actions, action, trophy, value) {
  if (action === GUIDE_ACTIONS.toggleEarned) actions.onToggleEarned?.(trophy.id);
  if (action === GUIDE_ACTIONS.setCounter) actions.onSetCounter?.(trophy.id, value);
  if (action === GUIDE_ACTIONS.reveal) actions.onReveal?.(trophy.id);
  panel.dispatchEvent(new CustomEvent('guide-action', { bubbles: true, detail: { action, id: trophy.id, value } }));
}

// ---------- empty state & DOM helpers ----------

function buildEmptyGuide() {
  const box = el('div', 'guide-empty');
  box.append(
    el('i', 'grade-icon grade-platinum guide-empty-icon'),
    textEl('h2', '', 'Pick a trophy'),
    textEl('p', '', 'Select any row to open its guide: when to get it, missable warnings, step-by-step notes and the sources each tip comes from.'),
  );
  return box;
}

function card(title, body, extraClass = '') {
  const section = el('section', `guide-card ${extraClass}`.trim());
  section.append(textEl('h3', '', title));
  if (body) section.append(body);
  return section;
}

function listEl(tag, className, items) {
  const list = el(tag, className);
  for (const item of items) list.append(textEl('li', '', item));
  return list;
}

function textEl(tag, className, text) {
  const node = el(tag, className);
  node.textContent = text;
  return node;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
