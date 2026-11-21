// Screenshot scenes for tools/take-screenshots.mjs, loaded only with ?shot=<scene>.
// Each scene puts the real app into a realistic state through the shell's API
// (nothing is faked in the DOM), then sets document.title = 'shot-ready'.
import { importProgressFile, PROGRESS_SCHEMA } from './progress-storage.js';

/** Run one scene: 'tracker' | 'roadmap' | 'spoilers' | 'import'. */
export default async function runScreenshotScene(api, shot) {
  const scene = SCENES[shot];
  if (!scene) throw new Error(`Unknown screenshot scene "${shot}"`);
  await scene(api);
  await settle();
  document.title = 'shot-ready';
}

const SCENES = {
  /** Tracker with a mid-game save, spoilers shown, guide open on a missable-risk collectible. */
  async tracker(api) {
    api.setProgress(midGameProgress());
    api.setSettings({ spoilers: 'show' });
    api.setRoute('list');
    api.setState({ sort: 'roadmap', kinds: new Set(), grade: 'all', status: 'all', query: '' });
    api.selectTrophy(28);
    scrollRowIntoView(28, 'start', 1);
  },

  /** Roadmap tab: five stage cards with progress bars and the missable panel. */
  async roadmap(api) {
    api.setProgress(midGameProgress());
    api.setSettings({ spoilers: 'show' });
    api.setRoute('roadmap');
    api.selectTrophy(28);
    document.getElementById('roadmap').scrollTop = 0;
  },

  /** Spoiler shield on, Story + Missable chips active, guide on a masked story trophy. */
  async spoilers(api) {
    api.setProgress(earlyGameProgress());
    api.setSettings({ spoilers: 'hide' });
    api.setRoute('list');
    api.setState({ kinds: new Set(['story', 'missable']), sort: 'roadmap', status: 'all', grade: 'all', query: '' });
    api.selectTrophy(9);
    scrollRowIntoView(9, 'center');
  },

  /** A real import through importProgressFile, then Collectibles chip + a count trophy's guide. */
  async import(api) {
    api.setSettings({ spoilers: 'show' });
    const file = new File([JSON.stringify(exportedSave())], 'platinum-run-progress-2026-11-21.json', { type: 'application/json' });
    // Validate the same way the Import button does, then let the shell merge it and show its toast.
    await importProgressFile(file, api.data.trophies);
    await api.importFile(file);
    api.setRoute('list');
    api.setState({ kinds: new Set(['collectibles']), sort: 'roadmap', status: 'all', grade: 'all', query: '' });
    api.selectTrophy(31);
    scrollRowIntoView(31, 'center');
  },
};

// ---------- realistic saves ----------

const EARNED_MID_GAME = [2, 3, 4, 5, 8, 9, 20, 21, 46, 54, 24, 29, 33, 34, 36, 18, 19, 39, 53, 32, 47, 44];

const COUNTERS_MID_GAME = {
  31: 37, 15: 112, 35: 64, 42: 30, 30: 2, 28: 11, 17: 29, 25: 5, 26: 9, 23: 4,
  16: 6, 43: 5, 48: 212, 51: 6, 40: 2, 55: 6, 54: 8, 34: 3, 36: 5, 18: 14, 19: 20, 32: 50, 53: 100000,
};

function midGameProgress() {
  return { earned: datesFor(EARNED_MID_GAME), counters: { ...COUNTERS_MID_GAME } };
}

function earlyGameProgress() {
  return { earned: datesFor([2, 3, 8, 20, 21, 46, 54]), counters: { 31: 12, 15: 40, 28: 4, 54: 8 } };
}

/** What an exported file from a second console might look like (schema-tagged, ids as strings). */
function exportedSave() {
  return {
    schema: PROGRESS_SCHEMA,
    exportedAt: '2026-11-21T08:40:00.000Z',
    earned: datesFor([...EARNED_MID_GAME, 30, 42]),
    counters: { ...COUNTERS_MID_GAME, 30: 3, 42: 52, 31: 58, 15: 131 },
    settings: { spoilers: 'show' },
  };
}

/** Spread earn dates over launch weekend so exported files look like real play. */
function datesFor(ids) {
  const start = Date.parse('2026-11-19T10:00:00Z');
  return Object.fromEntries(ids.map((id, i) => [String(id), new Date(start + i * 2.9 * 3600e3).toISOString()]));
}

// ---------- helpers ----------

/** Scroll the checklist so a row (and `before` rows above it) are in view. */
function scrollRowIntoView(id, block = 'center', before = 0) {
  const list = document.getElementById('trophy-list');
  let row = list.querySelector(`.trophy-row[data-id="${id}"]`);
  if (!row) return;
  for (let i = 0; i < before && row.previousElementSibling; i++) row = row.previousElementSibling;
  row.scrollIntoView({ block, inline: 'nearest' });
  window.scrollTo(0, 0);
}

/** Wait for layout, the footer measurement and two frames so the shot is final. */
async function settle() {
  const stats = document.getElementById('load-stats');
  for (let i = 0; i < 40 && /measuring/i.test(stats.textContent); i++) await wait(50);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
