// Shared helpers for the /reblock_site browser tools: Playwright, a static server for the export,
// the work list (pages.json) and settling a page before it is measured or shot.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_DIR || '/Users/pedroconsuegra/Sites/projects/ozone-design-system/.ds-sync/node_modules/playwright';
export const { chromium } = await import(path.join(PW, 'index.mjs'));

// Trackers and chat widgets: aborted on both sides, so they never count as differences or errors.
export const TRACKERS = /googletagmanager|google-analytics|facebook\.(net|com)|connect\.facebook|tiktok|clarity\.ms|hotjar|doubleclick|wati\.io|analytics\.|pixel\.|chatway|tawk\.to|intercom/;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

// Serve a folder on 127.0.0.1 with Range support: relative URLs resolve as on a host and videos play.
export function serveDir(root) {
  root = path.resolve(root);
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, rel);
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
        const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
        const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
        if (range) {
          const start = range[1] ? Number(range[1]) : 0;
          const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
          res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(file).pipe(res);
      });
    }).listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// pages.json: { export, site, widths, landmarks, menu, pages: [{ key, title, design, path, of, click, siteClick }] }.
// An entry with "of" is a state of another page (same design file and path, plus clicks).
export function readWork(file) {
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byKey = Object.fromEntries(cfg.pages.map(p => [p.key, p]));
  const pages = cfg.pages.map(p => (p.of ? { ...byKey[p.of], title: undefined, ...p } : p));
  return { cfg, pages };
}

// Options: --name=value pairs; everything else is positional.
export function parseArgs(argv) {
  const opts = {}, pos = [];
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) opts[m[1]] = m[2] === undefined ? true : m[2]; else pos.push(a);
  }
  return { opts, pos };
}

export function widthsOf(opts, cfg, fallback = [390, 1440]) {
  if (opts.widths) return String(opts.widths).split(',').map(Number);
  return (cfg && cfg.widths) || fallback;
}

// The design file is a path relative to the export root, possibly with a ?query (claude.ai/design states).
export function designUrl(base, p) {
  const [file, query] = p.design.split(/(?=\?)/);
  return base + '/' + file.split('/').map(encodeURIComponent).join('/') + (query || '');
}

export function siteUrl(cfg, p) {
  return new URL(p.path || '/', cfg.site).href;
}

export function viewport(w) {
  return { width: w, height: w < 600 ? 844 : 900 };
}

// A context that drops trackers, with the console collected into `log`.
export async function newPage(browser, w, log) {
  const ctx = await browser.newContext({ viewport: viewport(w), deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => (TRACKERS.test(r.request().url()) ? r.abort() : r.continue()));
  if (log) {
    page.on('console', m => { if (m.type() === 'error') log.push('console: ' + m.text().slice(0, 200)); });
    page.on('pageerror', e => log.push('pageerror: ' + String(e).slice(0, 200)));
    page.on('requestfailed', r => {
      const err = (r.failure() || {}).errorText || '';
      // Chrome aborts media range requests on its own (pause, seek): not a broken file.
      if (TRACKERS.test(r.url()) || (r.resourceType() === 'media' && /ERR_ABORTED/.test(err))) return;
      log.push('failed: ' + r.url().slice(0, 160) + ' (' + err + ')');
    });
  }
  return { ctx, page };
}

export async function open(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(e => console.log('  goto ' + url + ': ' + e.message.split('\n')[0]));
}

// Deterministic render: no animation or transition, every lazy image in, videos on their first
// frame, fonts loaded. Both sides go through the same steps, so what is left is the port.
export async function settle(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}' }).catch(() => {});
  await page.evaluate(async () => {
    // Instant scrolls: a design with scroll-behavior:smooth would still be moving at the screenshot.
    document.documentElement.style.scrollBehavior = 'auto';
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise(r => setTimeout(r, 90));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
    await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 5000); })));
    document.querySelectorAll('video').forEach(v => { try { v.pause(); v.currentTime = 0; } catch (e) { /* not loaded */ } });
    await document.fonts.ready;
  }).catch(e => console.log('  settle: ' + e.message.split('\n')[0]));
  await page.waitForTimeout(500);
}

export async function runClicks(page, clicks) {
  for (const sel of clicks || []) {
    await page.click(sel, { timeout: 5000 }).catch(e => console.log('  click failed: ' + sel + ' (' + e.message.split('\n')[0] + ')'));
    await page.waitForTimeout(350);
  }
}
