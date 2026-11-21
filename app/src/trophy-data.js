// Loads the 55-trophy list once per page: memory cache, then a localStorage copy
// revalidated against the server with ETag / If-None-Match.

export const DATA_URL = './data/trophies.json';
export const DATA_CACHE_KEY = 'platinum-run:data';

export const GRADE_ORDER = ['platinum', 'gold', 'silver', 'bronze'];
export const GRADE_POINTS = { platinum: 300, gold: 90, silver: 30, bronze: 15 };
export const FILTER_KINDS = ['story', 'missable', 'collectibles', 'activities', 'online'];

let memoryCache = null;
let inFlight = null;

/** Fetch (or reuse) the trophy data. Resolves to {trophies, sources, meta, fromCache}. */
export function loadTrophyData({ fetchImpl = globalThis.fetch, storage = defaultStorage() } = {}) {
  if (memoryCache) return Promise.resolve(memoryCache);
  if (inFlight) return inFlight;
  inFlight = fetchWithRevalidation(fetchImpl, storage)
    .then((result) => (memoryCache = result))
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Human label for a grade key: 'gold' -> 'Gold'. */
export function gradeLabel(grade) {
  const g = String(grade || '');
  return g ? g[0].toUpperCase() + g.slice(1) : '';
}

/** Turn raw JSON into the shape the app uses: trophies sorted by id with defaults filled in. */
export function normaliseTrophyData(raw) {
  if (!raw || !Array.isArray(raw.trophies)) throw new Error('Trophy data has no "trophies" array');
  const { trophies, sources, ...meta } = raw;
  const list = trophies
    .filter((t) => t && Number.isInteger(t.id))
    .map(normaliseTrophy)
    .sort((a, b) => a.id - b.id);
  return { trophies: list, sources: sources && typeof sources === 'object' ? sources : {}, meta };
}

/** Forget the in-memory copy (used by tests and after an explicit refresh). */
export function clearTrophyDataCache() {
  memoryCache = null;
  inFlight = null;
}

async function fetchWithRevalidation(fetchImpl, storage) {
  const cached = readCachedCopy(storage);
  const headers = cached?.etag ? { 'If-None-Match': cached.etag } : {};
  let response;
  try {
    response = await fetchImpl(DATA_URL, { cache: 'no-cache', headers });
  } catch (err) {
    if (cached) return { ...normaliseTrophyData(cached.json), fromCache: true };
    throw err;
  }
  if (response.status === 304 && cached) return { ...normaliseTrophyData(cached.json), fromCache: true };
  if (!response.ok) {
    if (cached) return { ...normaliseTrophyData(cached.json), fromCache: true };
    throw new Error(`Trophy data request failed: HTTP ${response.status}`);
  }
  const json = await response.json();
  const data = normaliseTrophyData(json);
  writeCachedCopy(storage, response.headers?.get?.('ETag') || null, json);
  return { ...data, fromCache: false };
}

function normaliseTrophy(t) {
  const missable = t.missable === true || t.missable === 'risk' ? t.missable : false;
  return {
    ...t,
    name: String(t.name ?? ''),
    description: String(t.description ?? ''),
    grade: GRADE_ORDER.includes(t.grade) ? t.grade : 'bronze',
    hidden: Boolean(t.hidden),
    kind: t.kind || 'misc',
    filters: Array.isArray(t.filters) ? t.filters.filter((f) => FILTER_KINDS.includes(f)) : [],
    chapter: t.chapter ?? null,
    missable,
    missableNote: t.missableNote ?? null,
    count: Number.isInteger(t.count) && t.count > 0 ? t.count : null,
    stage: Number.isInteger(t.stage) ? t.stage : 5,
    guide: String(t.guide ?? ''),
    steps: Array.isArray(t.steps) ? t.steps : [],
    tips: Array.isArray(t.tips) ? t.tips : [],
    cite: Array.isArray(t.cite) ? t.cite : [],
  };
}

function readCachedCopy(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(DATA_CACHE_KEY) || 'null');
    return parsed && parsed.json && Array.isArray(parsed.json.trophies) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedCopy(storage, etag, json) {
  try {
    storage?.setItem(DATA_CACHE_KEY, JSON.stringify({ etag, json, savedAt: new Date().toISOString() }));
  } catch {
    // Quota or privacy mode: the app still works without the cached copy.
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
