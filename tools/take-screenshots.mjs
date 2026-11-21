// Takes the four contact-sheet screenshots of the app.
// Serves app/ on a free local port, drives headless Chrome over the DevTools
// protocol at 1280x800, waits for each ?shot=<scene> page to set its title to
// 'shot-ready' and saves a JPEG (<= 250 KiB) into screenshots/.
// Usage: node tools/take-screenshots.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'app');
const OUT_DIR = path.join(ROOT, 'screenshots');
const CHROME = '/usr/bin/google-chrome';
const VIEWPORT = { width: 1280, height: 800 };
const MAX_BYTES = 250 * 1024;

export const SCENES = [
  { scene: 'tracker', file: '1-tracker-guide-sources.jpg' },
  { scene: 'roadmap', file: '2-platinum-roadmap-missables.jpg' },
  { scene: 'spoilers', file: '3-spoiler-shield-story-filter.jpg' },
  { scene: 'import', file: '4-import-export-collectibles.jpg' },
];
const OLD_SHOTS = ['1-checklist.jpg', '2-silver.jpg', '3-bronze.jpg'];

async function main() {
  const server = await startStaticServer(APP_DIR);
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(path.join(ROOT, '.scratch', 'chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  try {
    const browser = await connectCdp(await waitForDevToolsUrl(profile));
    for (const { scene, file } of SCENES) {
      const bytes = await captureScene(browser, `${base}/index.html?shot=${scene}`);
      await writeFile(path.join(OUT_DIR, file), bytes);
      console.log(`${file}  ${(bytes.length / 1024).toFixed(1)} KiB`);
    }
    browser.close();
    for (const old of OLD_SHOTS) if (existsSync(path.join(OUT_DIR, old))) await unlink(path.join(OUT_DIR, old));
    await writeShotsManifest();
  } finally {
    chrome.kill();
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

/** One isolated browser context per scene, so no localStorage leaks between scenes. */
async function captureScene(browser, url) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => browser.send(method, params, sessionId);
  await page('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Page.navigate', { url });
  await waitForTitle(page, 'shot-ready', 15000);
  let bytes;
  for (const quality of [90, 85, 80, 75, 70, 60, 50]) {
    const { data } = await page('Page.captureScreenshot', { format: 'jpeg', quality });
    bytes = Buffer.from(data, 'base64');
    if (bytes.length <= MAX_BYTES) break;
  }
  await browser.send('Target.closeTarget', { targetId });
  await browser.send('Target.disposeBrowserContext', { browserContextId });
  return bytes;
}

async function waitForTitle(page, title, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { result } = await page('Runtime.evaluate', { expression: 'document.title' });
    if (result.value === title) return;
    await delay(100);
  }
  const { result } = await page('Runtime.evaluate', { expression: 'JSON.stringify([location.href, document.title, document.documentElement.dataset.shotReady, document.documentElement.outerHTML.slice(0,300)])' });
  throw new Error(`Timed out waiting for title "${title}": ${result.value}`);
}

async function writeShotsManifest() {
  const shots = SCENES.map(({ scene, file }) => ({ file, path: `/?shot=${scene}`, viewport: VIEWPORT }));
  const lines = shots.map((s) => `  ${JSON.stringify(s)}`).join(',\n');
  await writeFile(path.join(ROOT, 'shots.json'), `[\n${lines}\n]\n`);
}

// ---------- Chrome DevTools protocol ----------

async function waitForDevToolsUrl(profile) {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (existsSync(file)) {
      const [port, wsPath] = (await readFile(file, 'utf8')).trim().split('\n');
      if (port && wsPath) return `ws://127.0.0.1:${port}${wsPath}`;
    }
    await delay(100);
  }
  throw new Error('Chrome did not start (no DevToolsActivePort)');
}

function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled' && /warn|error/.test(msg.params.type)) {
      console.warn('  page:', msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') console.warn('  page error:', msg.params.exceptionDetails.exception?.description);
    const waiter = msg.id && pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.error) waiter.reject(new Error(`${waiter.method}: ${msg.error.message}`));
    else waiter.resolve(msg.result);
  });
  const client = {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
    },
    close: () => socket.close(),
  };
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(client), { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools WebSocket failed')), { once: true });
  });
}

// ---------- static server for app/ (with ETag revalidation) ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
};

function startStaticServer(dir) {
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
