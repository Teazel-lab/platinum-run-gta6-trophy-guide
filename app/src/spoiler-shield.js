// Spoiler shield: decides which trophies stay masked and what to show instead.
// Story trophies (and trophies PlayStation lists as hidden) stay masked until
// earned while the "Hide story spoilers" setting is on (the default).

/** True when this trophy's real name/description must not be shown yet. */
export function isSpoilerHidden(trophy, progress) {
  if (!trophy || trophy.grade === 'platinum') return false;
  if (progress?.earned?.[trophy.id]) return false;
  if (spoilerMode(progress) === 'show') return false;
  return isStoryTrophy(trophy) || trophy.hidden === true;
}

/** Replacement title for a masked trophy, e.g. "Hidden story trophy · Chapter 3". */
export function maskedName(trophy) {
  const label = isStoryTrophy(trophy) ? 'Hidden story trophy' : 'Hidden trophy';
  const chapter = chapterNumber(trophy);
  if (chapter != null) return `${label} · Chapter ${chapter}`;
  if (isFinalStoryTrophy(trophy)) return `${label} · Finale`;
  return label;
}

/** Replacement description for a masked trophy (no plot details). */
export function maskedDescription(trophy) {
  const chapter = chapterNumber(trophy);
  const where = chapter != null ? `during Chapter ${chapter}` : isFinalStoryTrophy(trophy) ? 'at the end of the story' : 'through normal play';
  return `Unlocks ${where}. Earn it or turn off “Hide story spoilers” to reveal the name and guide.`;
}

/** 'hide' unless the player explicitly chose 'show'. */
export function spoilerMode(progress) {
  return progress?.settings?.spoilers === 'show' ? 'show' : 'hide';
}

/** Story-mission trophies: kind 'story' or tagged with the story filter. */
export function isStoryTrophy(trophy) {
  return trophy?.kind === 'story' || (Array.isArray(trophy?.filters) && trophy.filters.includes('story'));
}

/** Chapter number from "Chapter 2 · Breakfast Run" (or the description), else null. */
export function chapterNumber(trophy) {
  const text = trophy?.chapter || '';
  const m = /chapter\s*(\d+)/i.exec(text) || /chapter\s*(\d+)/i.exec(trophy?.description || '');
  return m ? Number(m[1]) : null;
}

function isFinalStoryTrophy(trophy) {
  return /\bfinal mission\.?$/i.test(trophy?.description || '') || /final|finale|epilogue/i.test(trophy?.chapter || '');
}
