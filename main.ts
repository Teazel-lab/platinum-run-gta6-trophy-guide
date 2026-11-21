// PLATINUM RUN · GTA VI trophy guide & tracker — make.fun entry for gta6-trophy-guide-01 (Node 22+, standard library).
//
// The app is app/: plain static files (index.html, style.css, ES modules in app/src/), no framework, no build step,
// fully offline. It tracks all 55 PS5 trophies of Grand Theft Auto VI with their official names, descriptions and
// grades, saves progress in localStorage with JSON export/import, filters by story / missable / collectibles /
// activities / online, hides story trophies behind a spoiler shield until earned, lays out a 5-stage platinum roadmap
// with missable flags, and opens an own-words guide per trophy with its named, linked sources.
//
// app/src/ — one job per file:
//   app-shell.js          controller: wires the views, #/list #/roadmap #/trophy/<id> routing, '/' focuses search
//   trophy-data.js        loadTrophyData(): fetches data/trophies.json after first paint, cached; grade order/points
//   progress-storage.js   saveProgress / loadProgress, toggleEarned, setCounter, exportProgressFile, importProgressFile
//   trophy-filters.js     applyTrophyFilters, countByFilter (chip badges), matchesSearch
//   spoiler-shield.js     isSpoilerHidden, maskedName, maskedDescription for unearned story trophies
//   roadmap-builder.js    buildPlatinumRoadmap (5 stages), listMissables in story order
//   trophy-list-view.js   renderTrophyList: keyed in-place rows with grade, kind chips, counters, earned checkbox
//   guide-panel.js        renderGuidePanel: guide text, steps, tips, missable warning and the cited Sources links
//   roadmap-view.js       renderRoadmapView and the compact missables strip
//   first-load-stats.js   measures the real first-load files and gzip bytes for the footer (loaded after render)
//   screenshot-scenes.js  ?shot=<scene> presets, imported only by the screenshot tool
// app/data/trophies.json — the 55 official trophies plus our guides, roadmap stages, counts and the source list.
// tools/take-screenshots.mjs — serves app/, drives headless Chrome at 1280x800 and writes screenshots/*.jpg.
//
// This program hands the entry in: it copies app/ and screenshots/ to /output and writes /output/dossier.json with
// buildDossier from the vendored make.fun library (leave vendor/ byte-identical: the scorer checks it).
//
// Run locally:  node serve.ts   then open http://localhost:8080
// Build output: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files and directories in app/ or
// 48 MiB of app files: app/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 50331648 }),
);
