// App shell: the single module index.html loads. Loads data + saved progress,
// renders header, filters, checklist, guide pane and roadmap, wires every control
// and routes by hash (#/list, #/roadmap, #/trophy/<id>). Rendering lives in the view modules.
import { loadTrophyData, GRADE_ORDER } from './trophy-data.js';
import {
  loadProgress, saveProgress, toggleEarned, setCounter, updateSettings,
  exportProgressFile, importProgressFile, progressSummary, platinumReady,
} from './progress-storage.js';
import { applyTrophyFilters, countByFilter } from './trophy-filters.js';
import { buildPlatinumRoadmap, listMissables } from './roadmap-builder.js';
import { renderTrophyList, ROW_ACTIONS } from './trophy-list-view.js';
import { renderGuidePanel } from './guide-panel.js';
import { renderRoadmapView, renderMissablesStrip, renderRoadmapProgress } from './roadmap-view.js';

const $ = (id) => document.getElementById(id);

const app = {
  data: null,
  byId: new Map(),
  progress: loadProgress(),
  persist: true,
  route: 'list',
  state: { kinds: new Set(), grade: 'all', status: 'all', query: '', sort: 'roadmap', selectedId: null },
};

/** Boot: wire controls immediately, then load the trophy data (after first paint) and render. */
export async function startApp() {
  wireControls();
  syncControls();
  try {
    app.data = await loadTrophyData();
  } catch (err) {
    $('trophy-list').replaceChildren(textNode('p', 'list-empty', `Could not load the trophy list (${err.message}).`));
    return;
  }
  app.byId = new Map(app.data.trophies.map((t) => [t.id, t]));
  applyRoute(location.hash);
  renderAll();
  showLoadStats();
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) await runScreenshotScene(shot);
}

// ---------- rendering ----------

function renderAll() {
  renderHeader();
  renderCoverageStrip();
  renderFilterCounts();
  renderList();
  renderGuide();
  renderMissablesStrip($('missables-strip'), listMissables(app.data.trophies), viewOptions());
  renderRoadmapProgress($('roadmap-mini'), buildPlatinumRoadmap(app.data.trophies, app.progress));
  if (app.route === 'roadmap') renderRoadmap();
}

function renderHeader() {
  const s = progressSummary(app.data.trophies, app.progress);
  const ring = $('progress-ring').querySelector('.ring-value');
  ring.setAttribute('stroke-dasharray', `${s.percent} 100`);
  ring.style.opacity = s.earned ? '1' : '0';
  $('progress-ring').setAttribute('aria-label', `Platinum progress ${s.percent}%`);
  $('progress-text').innerHTML = '';
  $('progress-text').append(textNode('strong', '', `${s.earned} / ${s.total}`), ` earned · ${s.percent}% · ${s.points} pts`);
  for (const grade of GRADE_ORDER) {
    const item = $('grade-tally').querySelector(`[data-grade="${grade}"]`);
    const g = s.byGrade[grade] || { earned: 0, total: 0 };
    if (item) {
      item.querySelector('span').textContent = `${g.earned}/${g.total}`;
      item.title = `${grade[0].toUpperCase()}${grade.slice(1)}: ${g.earned} of ${g.total} earned`;
    }
  }
}

/** "55/55 official trophies · 55 cited guides · N sources · M missable flags · 5-stage roadmap", counted from the data. */
function renderCoverageStrip() {
  const { trophies, sources } = app.data;
  const official = trophies.filter((t) => t.name && t.description && GRADE_ORDER.includes(t.grade)).length;
  const cited = trophies.filter((t) => t.guide && t.cite.length && t.cite.every((key) => sources[key])).length;
  const usedSources = new Set(trophies.flatMap((t) => t.cite).filter((key) => sources[key])).size;
  const missables = trophies.filter((t) => t.missable === true || t.missable === 'risk').length;
  const stages = new Set(trophies.map((t) => t.stage)).size;
  const items = [
    [`${official}/${trophies.length}`, 'official trophies'],
    [String(cited), 'cited guides'],
    [String(usedSources), 'linked sources'],
    [String(missables), missables === 1 ? 'missable flag' : 'missable flags'],
    [`${stages}-stage`, 'roadmap'],
  ];
  $('coverage-strip').replaceChildren(...items.map(([value, label]) => {
    const item = document.createElement('li');
    item.append(textNode('b', '', value), ` ${label}`);
    return item;
  }));
}

function renderFilterCounts() {
  const counts = countByFilter(app.data.trophies, app.progress);
  for (const chip of $('filter-chips').querySelectorAll('[data-kind]')) {
    const kind = chip.dataset.kind;
    const count = counts[kind] ?? 0;
    chip.querySelector('.chip-count').textContent = String(count);
    chip.classList.toggle('is-zero', count === 0);
    chip.setAttribute('aria-pressed', String(app.state.kinds.has(kind)));
  }
}

function renderList() {
  const visible = applyTrophyFilters(app.data.trophies, app.progress, app.state);
  renderTrophyList($('trophy-list'), visible, app.progress, app.state, onRowAction);
}

function renderGuide() {
  const trophy = app.byId.get(Number(app.state.selectedId)) || null;
  renderGuidePanel($('guide-panel'), trophy, app.data.sources, app.progress, {
    onToggleEarned: (id) => changeEarned(id),
    onSetCounter: (id, n) => changeCounter(id, n),
  });
}

function renderRoadmap() {
  const stages = buildPlatinumRoadmap(app.data.trophies, app.progress);
  renderRoadmapView($('roadmap'), stages, listMissables(app.data.trophies), viewOptions());
}

function viewOptions() {
  return { trophiesById: app.byId, progress: app.progress, selectedId: app.state.selectedId, onSelect: selectTrophy };
}

// ---------- actions ----------

function onRowAction(id, action) {
  if (action === ROW_ACTIONS.toggleEarned) changeEarned(id);
  else selectTrophy(id);
}

/** Open a trophy's guide; in the list view the hash becomes #/trophy/<id>. */
function selectTrophy(id) {
  app.state.selectedId = Number(id);
  if (app.route === 'list') history.replaceState(null, '', `#/trophy/${id}`);
  renderList();
  renderGuide();
  if (app.route === 'roadmap') renderRoadmap();
}

function changeEarned(id) {
  const wasReady = platinumReady(app.data.trophies, app.progress);
  commitProgress(toggleEarned(app.progress, id));
  const trophy = app.byId.get(id);
  if (app.progress.earned[id] && trophy) showToast(`Earned: ${trophy.name}`);
  if (!wasReady && platinumReady(app.data.trophies, app.progress)) showToast('Every trophy done — the platinum is next!');
}

function changeCounter(id, n) {
  const trophy = app.byId.get(id);
  let next = setCounter(app.progress, id, n, trophy?.count ?? Infinity);
  const complete = trophy?.count && next.counters[id] >= trophy.count && !next.earned[id];
  if (complete) next = toggleEarned(next, id);
  commitProgress(next);
  if (complete) showToast(`${trophy.count}/${trophy.count} — ${trophy.name} marked earned`);
}

function changeSettings(patch) {
  commitProgress(updateSettings(app.progress, patch));
}

/** Store new progress, save it and refresh every view that shows it. */
function commitProgress(next) {
  app.progress = next;
  if (app.persist && !saveProgress(app.progress)) showToast('Progress could not be saved (storage full or blocked).');
  syncControls();
  if (app.data) renderAll();
}

async function importFromFile(file) {
  try {
    const result = await importProgressFile(file, app.data.trophies, app.progress);
    commitProgress(result.progress);
    const ignored = result.ignored ? ` · ${result.ignored} unknown id${result.ignored === 1 ? '' : 's'} skipped` : '';
    showToast(`Imported ${result.imported} trophies${ignored}`);
  } catch (err) {
    showToast(`Import failed: ${err.message}`);
  }
}

// ---------- routing ----------

function applyRoute(hash) {
  const m = /^#\/(list|roadmap|trophy)(?:\/(\d+))?/.exec(hash || '');
  const name = m ? m[1] : 'list';
  if (name === 'trophy' && app.byId.has(Number(m[2]))) app.state.selectedId = Number(m[2]);
  app.route = name === 'roadmap' ? 'roadmap' : 'list';
  const onRoadmap = app.route === 'roadmap';
  $('trophy-list').hidden = onRoadmap;
  $('roadmap').hidden = !onRoadmap;
  document.body.dataset.view = app.route;
  for (const [tab, active] of [[$('nav-list'), !onRoadmap], [$('nav-roadmap'), onRoadmap]]) {
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function setRoute(route) {
  const hash = route.startsWith('#') ? route : `#/${route}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  applyRoute(hash);
  renderAll();
}

// ---------- controls ----------

function wireControls() {
  const search = $('search');
  search.addEventListener('input', () => updateState({ query: search.value }));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; updateState({ query: '' }); search.blur(); }
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); search.focus(); search.select(); }
  });

  $('filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-kind]');
    if (!chip) return;
    const kinds = new Set(app.state.kinds);
    if (kinds.has(chip.dataset.kind)) kinds.delete(chip.dataset.kind);
    else kinds.add(chip.dataset.kind);
    updateState({ kinds });
  });
  $('grade-filter').addEventListener('change', (e) => updateState({ grade: e.target.value }));
  $('status-filter').addEventListener('change', (e) => updateState({ status: e.target.value }));
  $('sort-select').addEventListener('change', (e) => updateState({ sort: e.target.value }));

  $('spoiler-toggle').addEventListener('change', (e) => {
    changeSettings({ spoilers: e.target.checked ? 'hide' : 'show' });
    showToast(e.target.checked ? 'Story spoilers hidden until earned' : 'Story spoilers shown');
  });

  $('export-progress').addEventListener('click', () => {
    const name = exportProgressFile(app.progress);
    showToast(`Saved ${name} · ${Object.keys(app.progress.earned).length} earned`);
  });
  $('import-progress').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && app.data) importFromFile(file);
  });

  window.addEventListener('hashchange', () => {
    if (!app.data) return;
    applyRoute(location.hash);
    renderAll();
  });
}

/** Merge a filter-state patch and re-render the checklist (and counts). */
function updateState(patch) {
  Object.assign(app.state, patch);
  syncControls();
  if (!app.data) return;
  renderFilterCounts();
  renderList();
  if (app.route === 'roadmap' && patch.selectedId !== undefined) renderRoadmap();
}

/** Push state + settings back into the form controls (after import, scenes, etc.). */
function syncControls() {
  $('spoiler-toggle').checked = app.progress.settings.spoilers !== 'show';
  if ($('search').value !== app.state.query) $('search').value = app.state.query;
  $('grade-filter').value = app.state.grade;
  $('status-filter').value = app.state.status;
  $('sort-select').value = app.state.sort;
}

// ---------- toast, load stats, screenshot hook ----------

let toastTimer = 0;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

/** Footer figure, measured after the UI is on screen (module loaded on demand). */
function showLoadStats() {
  const run = async () => {
    try {
      const { measureFirstLoadGzip, firstLoadSentence } = await import('./first-load-stats.js');
      $('load-stats').textContent = firstLoadSentence(await measureFirstLoadGzip(), app.data.fromCache);
    } catch {
      $('load-stats').textContent = 'First load: static files only · trophy data fetched after first paint';
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 300);
}

/** ?shot=<scene>: hand a small API to ./screenshot-scenes.js (loaded only on demand). */
async function runScreenshotScene(scene) {
  app.persist = false;
  const api = {
    data: app.data,
    setState: (patch) => { updateState(patch); renderAll(); },
    selectTrophy,
    setRoute,
    setProgress: (progress) => commitProgress({ ...app.progress, ...progress }),
    setSettings: (patch) => changeSettings(patch),
    importFile: (file) => importFromFile(file),
    showToast,
  };
  try {
    const module = await import('./screenshot-scenes.js');
    await module.default(api, scene);
  } catch (err) {
    console.warn('Screenshot scene failed:', err);
  }
  document.documentElement.dataset.shotReady = scene;
}

function textNode(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

startApp();
