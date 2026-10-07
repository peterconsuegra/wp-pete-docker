// Behaviour and hygiene of every page, on the design (its own defects, first) or on the port.
//   node sitecheck.mjs <pages.json> design|site [key ...] [--widths=360,390,768,1024,1280,1440,1600]
// Per page: console and page errors, failed requests, PHP warnings in the HTML, broken images, hosts
// other than the site's (a finished port loads nothing from the export's CDNs), horizontal overflow at
// every width (with the elements that stick out), and the header menu from pages.json "menu"
// ({ toggle, panel }) at 390: opens with its links, closes on Escape. Then every internal link once.
// Ends with "all checks ok" or the list of problems.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, serveDir, readWork, parseArgs, designUrl, siteUrl, newPage, open, settle } from './lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [file, mode, ...keys] = pos;
if (!file || !['design', 'site'].includes(mode)) { console.log('usage: node sitecheck.mjs <pages.json> design|site [key ...] [--widths=…]'); process.exit(1); }
const { cfg, pages } = readWork(file);
const widths = String(opts.widths || '360,390,768,1024,1280,1440,1600').split(',').map(Number);
const want = keys.length ? pages.filter(p => keys.includes(p.key)) : pages.filter(p => !p.of);
const problems = [];
const browser = await chromium.launch();
let server, base;
if (mode === 'design') ({ server, base } = await serveDir(cfg.export));
const origin = mode === 'design' ? base : new URL(cfg.site).origin;
const links = new Map();

const overflow = () => {
  const W = innerWidth;
  if (document.documentElement.scrollWidth <= W + 1) return null;
  const label = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.getAttribute('class') || '').trim() ? '.' + el.getAttribute('class').trim().split(/\s+/).slice(0, 2).join('.') : '');
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.right <= W + 1 || r.width === 0 || getComputedStyle(el).position === 'fixed') continue;
    let a = el.parentElement, clipped = false;
    while (a && a !== document.body) { if (/hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX)) { clipped = true; break; } a = a.parentElement; }
    if (!clipped) out.push(label(el) + ' →' + Math.round(r.right));
    if (out.length >= 4) break;
  }
  return document.documentElement.scrollWidth + 'px: ' + out.join(', ');
};

for (const p of want) {
  const log = [], hosts = new Set();
  const url = mode === 'design' ? designUrl(base, p) : siteUrl(cfg, p);
  const { ctx, page } = await newPage(browser, 1440, log);
  page.on('request', r => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.origin !== origin) hosts.add(u.host); } catch (e) { /* data: */ } });
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(e => { log.push('goto: ' + e.message.split('\n')[0]); return null; });
  await settle(page);
  const found = [];
  if (resp && resp.status() !== 200) found.push(`HTTP ${resp.status()}`);
  const html = await page.content();
  const php = html.match(/(?:<b>)?(?:Warning|Notice|Deprecated|Fatal error|Parse error)(?:<\/b>)?:\s[^<\n]{0,140}/g);
  if (php) found.push(...php.slice(0, 3).map(s => 'PHP ' + s.replace(/<\/?b>/g, '')));
  found.push(...log);
  const broken = await page.evaluate(() => [...document.images].filter(i => !i.getAttribute('src') || (i.complete && i.naturalWidth === 0)).map(i => i.getAttribute('src') || '(empty src: an asset missing from the manifest?) ' + (i.className || i.alt)));
  found.push(...broken.map(b => 'broken image ' + b));
  if (mode === 'site' && hosts.size) found.push('external hosts: ' + [...hosts].join(', '));
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
    await page.waitForTimeout(250);
    const o = await page.evaluate(overflow);
    if (o) found.push(`overflow at ${w}: ${o}`);
  }
  if (cfg.menu && cfg.menu.toggle) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const visible = sel => page.evaluate(s => { const el = document.querySelector(s); if (!el) return -1; const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0 ? el.querySelectorAll('a').length || 1 : 0; }, sel);
    const t = await page.$(cfg.menu.toggle);
    if (!t) found.push('menu: no toggle ' + cfg.menu.toggle);
    else if (!(await t.isVisible())) found.push('menu: toggle ' + cfg.menu.toggle + ' hidden at 390');
    else {
      const before = await visible(cfg.menu.panel);
      await t.click(); await page.waitForTimeout(400);
      const opened = await visible(cfg.menu.panel);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      const closed = await visible(cfg.menu.panel);
      const note = `menu: closed ${before ? 'NO' : 'yes'} → open ${opened > 0 ? opened + ' links' : 'NO'} → Escape ${closed ? 'still open' : 'closed'}`;
      if (before || opened <= 0 || closed) found.push(note); else console.log(`${p.key}: ${note}`);
    }
  }
  for (const href of await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href))) {
    const u = new URL(href);
    if (u.origin === origin && !links.has(u.origin + u.pathname)) links.set(u.origin + u.pathname, p.key);
  }
  await ctx.close();
  console.log(`${p.key}: ${found.length ? found.length + ' problem(s)' : 'ok'}`);
  for (const f of found) console.log('   ' + f);
  problems.push(...found.map(f => `${p.key}: ${f}`));
}

// Internal links: each target once (design: the file must exist in the export).
for (const [target, from] of links) {
  if (mode === 'design') {
    const rel = decodeURIComponent(new URL(target).pathname).replace(/^\//, '') || 'index.html';
    if (!fs.existsSync(path.join(cfg.export, rel.endsWith('/') ? rel + 'index.html' : rel))) problems.push(`${from}: link to missing file ${rel}`);
    continue;
  }
  const r = await fetch(target, { redirect: 'follow' }).catch(e => ({ status: e.message }));
  if (r.status !== 200) { problems.push(`${from}: link ${target} → ${r.status}`); continue; }
  // Plain permalinks (fresh Pete Panel sites) or a missing page: WordPress answers 200 with the front page.
  const body = /<body[^>]*class="([^"]*)"/.exec(await r.text());
  if (new URL(target).pathname !== '/' && body && /(^|\s)home(\s|$)/.test(body[1])) problems.push(`${from}: link ${target} renders the front page (plain permalinks, or no such page)`);
}
console.log(`internal links checked: ${links.size}`);
if (server) server.close();
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n` + problems.map(p => '  ' + p).join('\n') : '\nall checks ok');
