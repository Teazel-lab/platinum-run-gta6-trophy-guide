// Honest first-load figure for the footer: which files the page needed before the
// trophy data arrived (index.html, style.css, the static ES modules) and their real
// gzip size, measured in the browser with CompressionStream. Imported on demand
// after the UI has rendered, so it never slows the first paint.

/** Files loaded after first paint or on demand; they are not part of the first load. */
const NOT_FIRST_LOAD = /\/data\/|first-load-stats\.js|screenshot-scenes\.js|favicon/;

/**
 * Measure the first load. Resolves to {files, bytes, gzip:boolean, label}.
 * Re-reads each file from the HTTP cache and gzips it; falls back to raw bytes.
 */
export async function measureFirstLoadGzip(perf = globalThis.performance) {
  const urls = firstLoadUrls(perf);
  const canGzip = typeof CompressionStream === 'function';
  let bytes = 0;
  for (const url of urls) {
    try {
      const body = await (await fetch(url, { cache: 'force-cache' })).arrayBuffer();
      bytes += canGzip ? await gzipSize(body) : body.byteLength;
    } catch {
      // A file we cannot re-read is skipped rather than guessed.
    }
  }
  const kb = Math.round(bytes / 1024);
  return { files: urls.length, bytes, gzip: canGzip, label: `${urls.length} files · ${kb} KB ${canGzip ? 'gzip' : 'raw'}` };
}

/** Footer sentence, e.g. "First load: 11 files · 28 KB gzip · trophy data fetched after first paint · cached (ETag)". */
export function firstLoadSentence(stats, dataFromCache) {
  const data = dataFromCache ? 'trophy data from cache (ETag 304)' : 'trophy data fetched after first paint · cached (ETag)';
  return `First load: ${stats.label} · ${data}`;
}

function firstLoadUrls(perf) {
  const page = location.href.split(/[?#]/)[0];
  const resources = perf?.getEntriesByType ? perf.getEntriesByType('resource').map((e) => e.name) : [];
  const unique = new Set([page, ...resources.filter((u) => u.startsWith(location.origin) && !NOT_FIRST_LOAD.test(u))]);
  return [...unique];
}

async function gzipSize(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
}
