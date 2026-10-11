// Element by element inside one section, design vs site, in document order: for designs without
// classes (claude.ai/design screens are styled inline), where measure.mjs --deep has nothing to match.
//   node boxes.mjs <pages.json> <key> <width> <design selector> [site selector] [--rows=80]
// Walks every rendered element under the selector (display: contents is looked through, display: none
// skipped) and prints tag, top/left relative to the section, height x width, font size / line height
// and its own text, design | site. "<-" marks a row that moved or resized: the first one is where the
// difference starts. Both sides must keep the same element order (the port keeps the design's markup).
import { chromium, serveDir, readWork, parseArgs, designUrl, siteUrl, newPage, open, settle, runClicks } from './lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [file, key, w, dsel, ssel = dsel] = pos;
if (!file || !key || !w || !dsel) { console.log('usage: node boxes.mjs <pages.json> <key> <width> <design selector> [site selector] [--rows=80]'); process.exit(1); }
const { cfg, pages } = readWork(file);
const p = pages.find(x => x.key === key);
if (!p) { console.log('no such page key: ' + key); process.exit(1); }
const { server, base } = await serveDir(cfg.export);
const browser = await chromium.launch();

const grab = async (url, sel, clicks) => {
  const { ctx, page } = await newPage(browser, Number(w));
  await open(page, url); await runClicks(page, clicks); await settle(page);
  const rows = await page.evaluate(sel => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const R = root.getBoundingClientRect(), out = [];
    const walk = (el, d) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'contents') { for (const c of el.children) walk(c, d); return; }
      if (cs.display === 'none') return;
      const r = el.getBoundingClientRect();
      const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').slice(0, 24);
      out.push({ d, tag: el.tagName.toLowerCase(), top: Math.round(r.top - R.top), left: Math.round(r.left - R.left), h: Math.round(r.height), w: Math.round(r.width), txt, f: cs.fontSize + '/' + cs.lineHeight });
      for (const c of el.children) walk(c, d + 1);
    };
    walk(root, 0);
    return out;
  }, sel);
  await ctx.close();
  return rows;
};

const D = await grab(designUrl(base, p), dsel, p.click);
const S = await grab(siteUrl(cfg, p), ssel, p.siteClick || p.click);
if (!D || !S) console.log(`${!D ? 'design' : 'site'}: nothing matches ${!D ? dsel : ssel}`);
const n = Math.min(Math.max(D ? D.length : 0, S ? S.length : 0), Number(opts.rows || 80));
for (let i = 0; i < n; i++) {
  const a = D && D[i], b = S && S[i];
  const left = a ? `${'  '.repeat(a.d)}${a.tag} ${a.top}/${a.left} ${a.h}x${a.w} ${a.f} ${a.txt}` : '-';
  const right = b ? `${b.tag} ${b.top}/${b.left} ${b.h}x${b.w} ${b.f}` : '-';
  const moved = a && b && (a.top !== b.top || a.left !== b.left || a.h !== b.h || a.w !== b.w);
  console.log(left.padEnd(84) + ' | ' + right + (moved ? ' <-' : ''));
}
server.close();
await browser.close();
