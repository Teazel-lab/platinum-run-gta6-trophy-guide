// Builds the staged route to the platinum and the list of missable trophies.
import { chapterNumber } from './spoiler-shield.js';

/** The five roadmap stages, in play order (texts are our own words). */
export const ROADMAP_STAGES = [
  { stage: 1, title: 'Story run — grab these on the way',
    summary: 'Play the story chapters in order and pick up the mission-bound trophies as they come. Missables live here, so read the warnings before each chapter.' },
  { stage: 2, title: 'Collectibles sweep',
    summary: 'With the whole map open, clear the counted sets — cards, WAiNK spots, meditation spots, vehicles and stunts. Track each counter as you go.' },
  { stage: 3, title: 'Activities, ranges & races',
    summary: 'Work through the side activities: shooting ranges, drone and street races, fishing and arcade games. Medals and race wins stack up quickly once you have good gear.' },
  { stage: 4, title: 'Strangers & loose ends',
    summary: 'Finish every stranger strand and the one-off feats like heists, wanted-level escapes and odd jobs. Spend and launder money here too.' },
  { stage: 5, title: '100% and the platinum',
    summary: 'Check the in-game completion list for anything left, close out 100%, and the platinum follows.' },
];

/** Stages with their trophies (story order) and earned counts: [{stage,title,summary,trophyIds,done,total}]. */
export function buildPlatinumRoadmap(trophies, progress) {
  const earned = progress?.earned || {};
  const ordered = [...trophies].sort(byStoryOrder);
  return ROADMAP_STAGES.map((def) => {
    const ids = ordered.filter((t) => clampStage(t.stage) === def.stage).map((t) => t.id);
    return { ...def, trophyIds: ids, done: ids.filter((id) => earned[id]).length, total: ids.length };
  });
}

/**
 * Missable trophies (missable true or 'risk') in story order:
 * [{id, name, chapter, note, risk:'missable'|'risk'}]. Data without a
 * `missable` field falls back to the description-derived one-time signal.
 */
export function listMissables(trophies) {
  const derived = new Map(missableWarningsFromDescriptions(trophies).map((w) => [w.id, w]));
  return trophies
    .filter((t) => t.missable === true || t.missable === 'risk' || (t.missable === undefined && derived.get(t.id)?.signal === 'one-time'))
    .sort(byStoryOrder)
    .map((t) => ({
      id: t.id,
      name: t.name,
      chapter: t.chapter ?? null,
      note: t.missableNote || derived.get(t.id)?.reason || null,
      risk: t.missable === true ? 'missable' : 'risk',
    }));
}

/**
 * Secondary signal read from the official descriptions: which trophies are tied to
 * a chapter, a named mission, the final mission, or a one-time story moment.
 * Returns [{id, signal:'chapter'|'final-mission'|'mission'|'strand-finale'|'one-time', chapter, reason}].
 */
export function missableWarningsFromDescriptions(trophies) {
  const out = [];
  for (const t of trophies) {
    const d = String(t.description || '').trim();
    let m;
    if ((m = /\bchapter\s*(\d+)/i.exec(d))) {
      out.push({ id: t.id, signal: 'chapter', chapter: Number(m[1]), reason: `Unlocks when Chapter ${m[1]} ends — cannot be missed, but marks a point of no return for that chapter.` });
    } else if (/^complete the final mission\.?$/i.test(d)) {
      out.push({ id: t.id, signal: 'final-mission', chapter: null, reason: 'Story finale — finish any chapter-bound missables before starting it.' });
    } else if ((m = /final mission for (\w+)/i.exec(d))) {
      out.push({ id: t.id, signal: 'strand-finale', chapter: null, reason: `Ends ${m[1]}'s stranger strand.` });
    } else if (ONE_TIME_CUES.some((re) => re.test(d))) {
      out.push({ id: t.id, signal: 'one-time', chapter: chapterNumber(t), reason: 'The description points to a one-time story moment or choice — check the guide before you play past it.' });
    } else if ((m = /^complete (?!\d)(?!an? )(.+?)\.$/i.exec(d)) && !/\d|challenges|completion/i.test(m[1])) {
      out.push({ id: t.id, signal: 'mission', chapter: chapterNumber(t), reason: `Tied to the story mission “${m[1]}”.` });
    }
  }
  return out;
}

/** Sortable story position: chapter number first (finale after chapters, unchaptered last), then id. */
export function storyOrderKey(trophy) {
  return storyRank(trophy) * 1000 + (Number(trophy?.id) || 0);
}

const ONE_TIME_CUES = [/\bchoices?\b/i, /\bunscheduled\b/i, /\bsecond time\b/i, /\bjust happened\b/i];

function storyRank(trophy) {
  const n = chapterNumber(trophy);
  if (n != null) return n;
  if (/^complete the final mission\.?$/i.test(trophy?.description || '') || /final|finale|epilogue/i.test(trophy?.chapter || '')) return 90;
  return 99;
}

function byStoryOrder(a, b) {
  return storyOrderKey(a) - storyOrderKey(b);
}

function clampStage(stage) {
  const n = Math.round(Number(stage));
  return n >= 1 && n <= 5 ? n : 5;
}
