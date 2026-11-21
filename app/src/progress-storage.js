// Saved progress: which trophies are earned (with dates), collectible counters and settings.
// Stored in localStorage; exported/imported as a small tagged JSON file.

import { GRADE_ORDER, GRADE_POINTS } from './trophy-data.js';

export const PROGRESS_KEY = 'platinum-run:v1';
export const PROGRESS_SCHEMA = 'platinum-run-progress/1';
export const DEFAULT_SETTINGS = { spoilers: 'hide' };

/** Read saved progress; corrupt or missing storage yields a fresh, empty progress object. */
export function loadProgress(storage = defaultStorage()) {
  try {
    return sanitiseProgress(JSON.parse(storage?.getItem(PROGRESS_KEY) || 'null'));
  } catch {
    return emptyProgress();
  }
}

/** Persist progress. Returns false when storage is unavailable or full. */
export function saveProgress(progress, storage = defaultStorage()) {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(sanitiseProgress(progress)));
    return true;
  } catch {
    return false;
  }
}

/** Mark a trophy earned (today) or unearned. Returns a new progress object. */
export function toggleEarned(progress, id, now = new Date()) {
  const earned = { ...progress.earned };
  if (earned[id]) delete earned[id];
  else earned[id] = now.toISOString();
  return { ...progress, earned };
}

/** Set a collectible counter, clamped to 0..max (max = trophy.count when given). */
export function setCounter(progress, id, n, max = Infinity) {
  const value = clampCount(n, max);
  const counters = { ...progress.counters };
  if (value > 0) counters[id] = value;
  else delete counters[id];
  return { ...progress, counters };
}

/** Change one or more settings, e.g. {spoilers: 'show'}. Returns a new progress object. */
export function updateSettings(progress, patch) {
  return { ...progress, settings: { ...progress.settings, ...patch } };
}

/** Download progress as platinum-run-progress-YYYY-MM-DD.json. */
export function exportProgressFile(progress, now = new Date()) {
  const payload = {
    schema: PROGRESS_SCHEMA,
    exportedAt: now.toISOString(),
    ...sanitiseProgress(progress),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `platinum-run-progress-${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return link.download;
}

/**
 * Read an exported file and merge it into the current progress.
 * Resolves to {progress, imported, ignored}; rejects with a readable message if the file is invalid.
 */
export async function importProgressFile(file, trophies, current = emptyProgress()) {
  const text = typeof file === 'string' ? file : await file.text();
  return parseProgressImport(text, trophies, current);
}

/** Validate exported JSON text against the trophy list and merge it (union of earned, max of counters). */
export function parseProgressImport(text, trophies, current = emptyProgress()) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!data || data.schema !== PROGRESS_SCHEMA) {
    throw new Error(`Not a PLATINUM RUN progress file (expected schema "${PROGRESS_SCHEMA}").`);
  }
  const byId = new Map(trophies.map((t) => [String(t.id), t]));
  const ignoredIds = new Set();
  const importedIds = new Set();

  const incomingEarned = {};
  for (const [id, date] of Object.entries(isObject(data.earned) ? data.earned : {})) {
    if (!byId.has(id)) { ignoredIds.add(id); continue; }
    incomingEarned[id] = validDate(date) ? date : new Date().toISOString();
    importedIds.add(id);
  }
  const incomingCounters = {};
  for (const [id, n] of Object.entries(isObject(data.counters) ? data.counters : {})) {
    const trophy = byId.get(id);
    if (!trophy) { ignoredIds.add(id); continue; }
    const value = clampCount(n, trophy.count ?? Infinity);
    if (value > 0) { incomingCounters[id] = value; importedIds.add(id); }
  }

  const merged = mergeProgress(sanitiseProgress(current), {
    earned: incomingEarned,
    counters: incomingCounters,
    settings: isObject(data.settings) ? data.settings : {},
  });
  return { progress: merged, imported: importedIds.size, ignored: ignoredIds.size };
}

/** Merge two progress objects: union of earned (earliest date wins), max of counters, current settings win. */
export function mergeProgress(base, incoming) {
  const earned = { ...base.earned };
  for (const [id, date] of Object.entries(incoming.earned || {})) {
    if (!earned[id] || date < earned[id]) earned[id] = date;
  }
  const counters = { ...base.counters };
  for (const [id, n] of Object.entries(incoming.counters || {})) {
    counters[id] = Math.max(counters[id] || 0, n);
  }
  return { earned, counters, settings: { ...DEFAULT_SETTINGS, ...incoming.settings, ...base.settings } };
}

/** Totals for the header: {earned, total, byGrade, points, maxPoints, percent}. */
export function progressSummary(trophies, progress) {
  const byGrade = Object.fromEntries(GRADE_ORDER.map((g) => [g, { earned: 0, total: 0 }]));
  let earned = 0;
  let points = 0;
  let maxPoints = 0;
  for (const t of trophies) {
    const bucket = byGrade[t.grade] || (byGrade[t.grade] = { earned: 0, total: 0 });
    const value = GRADE_POINTS[t.grade] || 0;
    bucket.total += 1;
    maxPoints += value;
    if (progress.earned[t.id]) {
      bucket.earned += 1;
      earned += 1;
      points += value;
    }
  }
  const total = trophies.length;
  const percent = total ? Math.round((earned / total) * 100) : 0;
  return { earned, total, byGrade, points, maxPoints, percent };
}

/** True when every non-platinum trophy is earned (the platinum should pop next). */
export function platinumReady(trophies, progress) {
  const others = trophies.filter((t) => t.grade !== 'platinum');
  return others.length > 0 && others.every((t) => Boolean(progress.earned[t.id]));
}

export function emptyProgress() {
  return { earned: {}, counters: {}, settings: { ...DEFAULT_SETTINGS } };
}

function sanitiseProgress(raw) {
  const progress = emptyProgress();
  if (!isObject(raw)) return progress;
  for (const [id, date] of Object.entries(isObject(raw.earned) ? raw.earned : {})) {
    if (/^\d+$/.test(id) && validDate(date)) progress.earned[id] = date;
  }
  for (const [id, n] of Object.entries(isObject(raw.counters) ? raw.counters : {})) {
    const value = clampCount(n, Infinity);
    if (/^\d+$/.test(id) && value > 0) progress.counters[id] = value;
  }
  if (isObject(raw.settings)) {
    progress.settings = { ...progress.settings, ...raw.settings };
    if (!['hide', 'show'].includes(progress.settings.spoilers)) progress.settings.spoilers = 'hide';
  }
  return progress;
}

function clampCount(n, max) {
  const value = Math.floor(Number(n));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, max);
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
