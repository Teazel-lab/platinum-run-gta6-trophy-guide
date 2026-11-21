// Trophy filtering, searching and sorting for the checklist.
// Kind chips are OR-combined; grade, status and search narrow the result (AND).
import { isSpoilerHidden } from './spoiler-shield.js';
import { storyOrderKey } from './roadmap-builder.js';

/**
 * @param state {kinds:Set<string>, grade:'all'|grade, status:'all'|'earned'|'unearned', query:string, sort:'roadmap'|'list'|'grade'}
 * @returns a new, sorted array of the trophies that pass every filter.
 */
export function applyTrophyFilters(trophies, progress, state = {}) {
  const kinds = state.kinds instanceof Set ? state.kinds : new Set(state.kinds || []);
  const grade = state.grade || 'all';
  const status = state.status || 'all';
  const query = normalise(state.query);
  const earned = progress?.earned || {};

  const result = trophies.filter((t) => {
    if (kinds.size && ![...kinds].some((k) => matchesKind(t, k))) return false;
    if (grade !== 'all' && t.grade !== grade) return false;
    if (status === 'earned' && !earned[t.id]) return false;
    if (status === 'unearned' && earned[t.id]) return false;
    return !query || matchesSearch(t, query, progress);
  });
  return sortTrophies(result, state.sort || 'roadmap');
}

/** Trophy counts per filter chip: {story, missable, collectibles, activities, online}. */
export function countByFilter(trophies) {
  const counts = {};
  for (const kind of CHIP_KINDS) counts[kind] = trophies.filter((t) => matchesKind(t, kind)).length;
  return counts;
}

/**
 * Case-insensitive search over name, description, chapter and guide text.
 * Spoiler-hidden trophies are only searchable by chapter and grade, so typing
 * never reveals masked text.
 */
export function matchesSearch(trophy, query, progress) {
  const q = normalise(query);
  if (!q) return true;
  const fields = isSpoilerHidden(trophy, progress)
    ? [trophy.chapter ? trophy.chapter.split('·')[0] : '', trophy.grade]
    : [trophy.name, trophy.description, trophy.chapter, trophy.grade, trophy.guide, ...(trophy.steps || []), ...(trophy.tips || [])];
  const haystack = normalise(fields.filter(Boolean).join(' \n '));
  return q.split(' ').every((word) => haystack.includes(word));
}

/** Does the trophy belong to the given chip kind? */
export function matchesKind(trophy, kind) {
  if (kind === 'missable' && (trophy.missable === true || trophy.missable === 'risk')) return true;
  return Array.isArray(trophy.filters) && trophy.filters.includes(kind);
}

const CHIP_KINDS = ['story', 'missable', 'collectibles', 'activities', 'online'];
const GRADE_RANK = { platinum: 0, gold: 1, silver: 2, bronze: 3 };

function sortTrophies(list, sort) {
  const byId = (a, b) => a.id - b.id;
  if (sort === 'list') return list.sort(byId);
  if (sort === 'grade') return list.sort((a, b) => (GRADE_RANK[a.grade] ?? 9) - (GRADE_RANK[b.grade] ?? 9) || byId(a, b));
  return list.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9) || storyOrderKey(a) - storyOrderKey(b) || byId(a, b));
}

function normalise(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}
