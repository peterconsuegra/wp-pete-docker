// What each page's first screen needs: its LCP element at several widths and the font files of the
// text it shows. Drafts the theme's speed.json for the Reblock Page Speed plugin.
//   node lcpprobe.mjs <pages.json> [key ...] [--widths=390,600,768,900,1024,1200,1440] [--out=<speed.json>] [--force]
// LCP: the last largest-contentful-paint entry after load (an image's or a video poster's URL, or
// text). The hint names the element's class (or its nearest classed ancestor's), so it stays right
// when content changes (a journal's lead post); the plugin finds the URL while the page renders.
// Pages whose LCP changes with the width get one entry per width range, with a media query at the
// last probed width of the narrower range: check it against the design's breakpoints.
// Fonts: the @font-face file (latin subset first) of every visible text style in the first screen
// at the narrowest and widest width. A font most pages need goes to "fonts", others to the page.
import fs from 'node:fs';
import { chromium, readWork, parseArgs, siteUrl, newPage, open } from '../reblock_site/lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [file, ...keys] = pos;
if (!file) { console.log('usage: node lcpprobe.mjs <pages.json> [key ...] [--widths=…] [--out=<speed.json>] [--force]'); process.exit(1); }
const { cfg, pages } = readWork(file);
const want = pages.filter(p => !p.of && (!keys.length || keys.includes(p.key)));
const widths = String(opts.widths || '390,600,768,900,1024,1200,1440').split(',').map(Number);
const fontWidths = [widths[0], widths[widths.length - 1]];

const probe = () => new Promise(resolve => {
  let last = null;
  new PerformanceObserver(list => { const e = list.getEntries(); last = e[e.length - 1]; }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => {
    if (!last) return resolve(null);
    const el = last.element;
    let hint = el;
    while (hint && hint !== document.body && !(hint.getAttribute('class') || '').trim()) hint = hint.parentElement;
    const first = e => ((e && e.getAttribute('class')) || '').trim().split(/\s+/).filter(c => !/^(wp-|is-|has-)/.test(c))[0] || '';
    resolve({
      url: last.url || '', tag: el ? el.tagName.toLowerCase() : '?', cls: first(el), hintClass: first(hint),
      text: !last.url && el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50) : '', size: Math.round(last.size),
    });
  }, 300);
});

const firstScreenFonts = () => {
  const W = innerWidth, H = innerHeight, used = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim() || !t.parentElement) continue;
    const el = t.parentElement, r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width === 0 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const fam = cs.fontFamily.split(',')[0].trim().replace(/["']/g, '');
    used.set(`${fam}|${cs.fontWeight}|${cs.fontStyle}`, [fam, Number(cs.fontWeight), cs.fontStyle]);
  }
  const faces = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (r.type !== CSSRule.FONT_FACE_RULE) continue;
      const src = (r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)/) || [])[1];
      if (!src) continue;
      const w = (r.style.getPropertyValue('font-weight') || '400').split(/\s+/).map(Number);
      faces.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase(), min: w[0], max: w[1] || w[0],
        style: (r.style.getPropertyValue('font-style') || 'normal').trim(), range: r.style.getPropertyValue('unicode-range') || '',
        src: new URL(src, sheet.href || location.href).href });
    }
  }
  // Chrome normalises unicode-range ("U+0-FF, U+131"): the latin file is the one that covers "A".
  const latin = f => !f.range || f.range.split(',').some(t => {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(t.trim());
    if (!m) return false;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16), hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'f'), 16);
    return lo <= 0x41 && 0x41 <= hi;
  });
  const out = new Set();
  for (const [fam, weight, style] of used.values()) {
    const cands = faces.filter(f => f.family === fam.toLowerCase() && (f.style === style || (style !== 'normal' && f.style !== 'normal')) && weight >= f.min && weight <= f.max);
    const pick = cands.find(latin) || cands[0];
    if (pick) out.add(pick.src);
  }
  return [...out];
};

const browser = await chromium.launch();
const theme = new URL(cfg.site).origin + '/wp-content/themes/';
const rel = url => (url.startsWith(theme) ? url.slice(theme.length).replace(/^[^/]+\//, '') : url);
const result = {};
for (const p of want) {
  const url = siteUrl(cfg, p);
  const byWidth = [], fonts = new Set();
  for (const w of widths) {
    const { ctx, page } = await newPage(browser, w);
    await open(page, url);
    await page.waitForTimeout(1200);
    const lcp = await page.evaluate(probe);
    if (fontWidths.includes(w)) for (const f of await page.evaluate(firstScreenFonts)) fonts.add(rel(f));
    byWidth.push({ w, ...(lcp || {}) });
    await ctx.close();
  }
  result[p.key] = { byWidth, fonts: [...fonts] };
  console.log(`\n${p.key} (${url})`);
  for (const b of byWidth) console.log(`  ${String(b.w).padStart(4)}  ${(b.tag || '?') + (b.cls ? '.' + b.cls : '')}`.padEnd(40) + (b.url ? rel(b.url) + `  [hint class ${b.hintClass || '?'}]` : `text "${b.text || ''}"`) + `  (${b.size} px²)`);
  console.log('  first-screen fonts: ' + ([...fonts].join(', ') || 'none'));
}
await browser.close();

// The draft: LCP images per width range, fonts shared by most pages at the top.
const draft = { fonts: [], pages: {} };
const count = {};
for (const r of Object.values(result)) for (const f of r.fonts) count[f] = (count[f] || 0) + 1;
const shared = Object.keys(count).filter(f => count[f] >= Math.max(1, Math.ceil(want.length / 2)));
draft.fonts = shared;
for (const [key, r] of Object.entries(result)) {
  const entry = {};
  const groups = [];
  for (const b of r.byWidth) {
    const id = b.url && b.url.startsWith(new URL(cfg.site).origin) ? (b.hintClass ? 'class:' + b.hintClass : rel(b.url)) : '';
    const g = groups[groups.length - 1];
    if (g && g.id === id) g.to = b.w; else groups.push({ id, from: b.w, to: b.w });
  }
  const lcp = [];
  groups.forEach((g, i) => {
    if (!g.id) return;
    const media = [];
    if (i > 0) media.push(`(min-width: ${groups[i - 1].to + 1}px)`);
    if (i < groups.length - 1) media.push(`(max-width: ${g.to}px)`);
    const item = g.id.startsWith('class:') ? { class: g.id.slice(6) } : { image: g.id };
    if (media.length) item.media = media.join(' and ');
    lcp.push(item);
  });
  if (lcp.length) entry.lcp = lcp;
  const own = r.fonts.filter(f => !shared.includes(f));
  if (own.length) entry.fonts = own;
  if (Object.keys(entry).length) draft.pages[key] = entry;
}
console.log('\nspeed.json draft:\n' + JSON.stringify(draft, null, 2));
if (opts.out) {
  if (fs.existsSync(opts.out) && !opts.force) console.log(`\n${opts.out} exists: not overwritten (--force)`);
  else { fs.writeFileSync(opts.out, JSON.stringify(draft, null, 2) + '\n'); console.log(`\nwrote ${opts.out}`); }
}
