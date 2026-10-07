// Section by section: where the port differs from the design, in px (DOM boxes, not pixels).
//   node measure.mjs <pages.json> [key ...] [--widths=390,1440] [--tol=2] [--deep=<class>] [--shots=<dir>]
// Landmarks are the design's elements matching pages.json "landmarks" (default: body > header,
// main > *, body > footer). Each is found on the site by its rarest class (same index in the page),
// else its id: the port keeps the design's class names, so wrappers WordPress adds do not matter.
// A landmark with neither (claude.ai/design screens are inline-styled) is matched by position among
// the site's "siteLandmarks" (default: the template parts' header and footer, and main's children).
// --deep=<class>   every element with a class inside that landmark, by class and occurrence: the
//                  first rows that move or resize are where the difference starts.
// --shots=<dir>    element screenshots of every landmark off by more than tol, as
//                  <key>-<w>-sNN-<landmark>-design.png / -site.png (compare.py pairs them).
import fs from 'node:fs';
import { chromium, serveDir, readWork, parseArgs, widthsOf, designUrl, siteUrl, newPage, open, settle, runClicks } from './lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [file, ...keys] = pos;
if (!file) { console.log('usage: node measure.mjs <pages.json> [key ...] [--widths=390,1440] [--tol=2] [--deep=<class>] [--shots=<dir>]'); process.exit(1); }
const { cfg, pages } = readWork(file);
const tol = Number(opts.tol || 2);
const want = keys.length ? pages.filter(p => keys.includes(p.key)) : pages;
if (opts.shots) fs.mkdirSync(opts.shots, { recursive: true });

// In the design: each landmark with the selector that finds it again (rarest class + index, or id).
const designSide = sel => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.height > 0 || r.width > 0; };
  const out = [];
  for (const [pos, el] of [...document.querySelectorAll(sel)].filter(vis).entries()) {
    const classes = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
    let best = null;
    for (const c of classes) {
      const all = [...document.querySelectorAll('.' + CSS.escape(c))];
      if (!best || all.length < best.n) best = { c, n: all.length, i: all.indexOf(el) };
    }
    const r = el.getBoundingClientRect();
    const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (classes.length ? '.' + classes[0] : '');
    out.push({ name, pos, cls: best && best.c, idx: best ? best.i : -1, id: el.id || '', top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width) });
  }
  return { list: out, height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth };
};

// On the site: the same elements by class + index (or id).
const siteSide = ({ list, siteSel }) => {
  const byPos = [...document.querySelectorAll(siteSel)].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 || r.width > 0; });
  const res = list.map(l => {
    let el = null;
    if (l.cls) el = document.querySelectorAll('.' + CSS.escape(l.cls))[l.idx] || null;
    if (!el && l.id) el = document.getElementById(l.id);
    if (!el && !l.cls && !l.id) el = byPos[l.pos] || null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width) };
  });
  return { list: res, height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth };
};

// Descendants with a class inside one landmark, relative to it: key = first class + occurrence.
const deepSide = ({ cls, idx, id }) => {
  const root = (cls && document.querySelectorAll('.' + CSS.escape(cls))[idx]) || (id && document.getElementById(id));
  if (!root) return null;
  const R = root.getBoundingClientRect(), seen = {}, out = {};
  for (const el of root.querySelectorAll('[class]')) {
    const c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(x => x && !/^(wp-|is-|has-|wp-block)/.test(x))[0];
    if (!c) continue;
    seen[c] = (seen[c] || 0) + 1;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue; // not rendered: its position means nothing
    out[c + (seen[c] > 1 ? '#' + seen[c] : '')] = { top: Math.round(r.top - R.top), left: Math.round(r.left - R.left), h: Math.round(r.height), w: Math.round(r.width) };
  }
  return out;
};

const pad = (s, n) => String(s).padEnd(n);
const browser = await chromium.launch();
const { server, base } = await serveDir(cfg.export);
const sel = cfg.landmarks && cfg.landmarks !== 'CHANGE-ME' ? cfg.landmarks : 'body > header, main > *, body > footer';
const siteSel = cfg.siteLandmarks || '.wp-site-blocks > .wp-block-template-part > header, .wp-site-blocks > header, main > *, .wp-site-blocks > .wp-block-template-part > footer, .wp-site-blocks > footer';
let problems = 0;
for (const p of want) {
  for (const w of widthsOf(opts, cfg)) {
    const d = await newPage(browser, w), s = await newPage(browser, w);
    await open(d.page, designUrl(base, p)); await runClicks(d.page, p.click); await settle(d.page);
    await open(s.page, siteUrl(cfg, p)); await runClicks(s.page, p.siteClick || p.click); await settle(s.page);
    const D = await d.page.evaluate(designSide, sel);
    const S = await s.page.evaluate(siteSide, { list: D.list, siteSel });
    const dh = S.height - D.height;
    console.log(`\n${p.key} @${w}   design ${D.height}   site ${S.height}   ${dh ? 'Δ ' + (dh > 0 ? '+' : '') + dh : 'same height'}${S.width > w + 1 ? '   SITE OVERFLOWS to ' + S.width + ' px' : ''}`);
    console.log('   #  ' + pad('landmark', 34) + pad('design top/h', 15) + pad('site top/h', 15) + 'Δtop  Δh   Δw');
    let off = 0;
    for (let i = 0; i < D.list.length; i++) {
      const a = D.list[i], b = S.list[i];
      if (!b) { off++; console.log(`  ${pad(i + 1, 3)} ${pad(a.name.slice(0, 33), 34)}${pad(a.top + '/' + a.h, 15)}MISSING on the site (class .${a.cls}, index ${a.idx})`); continue; }
      const dt = b.top - a.top, dhh = b.h - a.h, dw = b.w - a.w;
      const bad = Math.abs(dhh) > tol || Math.abs(dw) > tol;
      if (bad) off++;
      console.log(`  ${pad(i + 1, 3)} ${pad(a.name.slice(0, 33), 34)}${pad(a.top + '/' + a.h, 15)}${pad(b.top + '/' + b.h, 15)}${pad(dt || '', 6)}${pad(dhh || '', 5)}${pad(dw || '', 5)}${bad ? '<-' : ''}`);
      if (bad && opts.shots) {
        const name = `${p.key}-${w}-s${String(i + 1).padStart(2, '0')}-${(a.cls || 'x').replace(/[^a-z0-9_-]/gi, '')}`;
        const shot = async (pg, side) => {
          const h = await pg.evaluateHandle(({ cls, idx, id }) => (cls && document.querySelectorAll('.' + CSS.escape(cls))[idx]) || document.getElementById(id), a);
          const el = h.asElement();
          if (el) await el.screenshot({ path: `${opts.shots}/${name}-${side}.png` }).catch(() => {});
        };
        await shot(d.page, 'design'); await shot(s.page, 'site');
      }
    }
    console.log(off ? `   ${off} landmark(s) off by more than ${tol} px` : '   all landmarks within ' + tol + ' px');
    problems += off + (Math.abs(dh) > tol ? 1 : 0);
    if (opts.deep) {
      const a = D.list.find(l => l.cls === opts.deep || l.name.includes('.' + opts.deep) || l.id === opts.deep);
      if (!a) console.log(`   --deep: no landmark with class ${opts.deep}`);
      else {
        const dd = await d.page.evaluate(deepSide, a), ss = await s.page.evaluate(deepSide, a);
        let shown = 0;
        console.log(`   deep ${opts.deep}: element                      design t/l h×w        site t/l h×w`);
        for (const [k, v] of Object.entries(dd || {})) {
          const x = ss && ss[k];
          const diff = !x || Math.abs(x.top - v.top) > tol || Math.abs(x.left - v.left) > tol || Math.abs(x.h - v.h) > tol || Math.abs(x.w - v.w) > tol;
          if (!diff) continue;
          if (++shown > 40) { console.log('     … more'); break; }
          console.log(`     ${pad(k.slice(0, 30), 31)}${pad(`${v.top}/${v.left} ${v.h}×${v.w}`, 22)}${x ? `${x.top}/${x.left} ${x.h}×${x.w}` : 'MISSING'}`);
        }
        if (!shown) console.log('     every classed element within ' + tol + ' px');
      }
    }
    await d.ctx.close(); await s.ctx.close();
  }
}
server.close();
await browser.close();
console.log(problems ? `\n${problems} difference(s) over ${tol} px` : '\nall pages within ' + tol + ' px');
