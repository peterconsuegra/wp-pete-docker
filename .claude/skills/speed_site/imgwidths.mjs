// Where the theme's photos show on each page, and how wide: the data for the site plugin's photo
// copies (srcset) and their sizes.
//   node imgwidths.mjs <pages.json> [key ...] [--out=<photos.json>] [--from=320] [--to=1920] [--step=20]
// Every page (states skipped) opens once and is resized from --from to --to px wide; every theme photo
// (an <img> or a video poster under the theme's folder, raster files only) is measured at each width.
// Per photo and page: a sizes value fitted to the measurements, straight calc() segments with a new
// one wherever the layout jumps. Widths are probed on multiples of --step from --from, so a breakpoint
// between two probes is written at the lower one (640, 900, 1000, 1200 and 1440 are probed exactly).
// Per photo: the copy widths worth making, 480 / 720 / 1000 / 1400 / 2000 below its own width and up to
// twice its widest place. Files under 30 KB, and photos never shown below half their width at 2x, get none.
import fs from 'node:fs';
import { chromium, readWork, parseArgs, siteUrl } from '../reblock_site/lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [file, ...keys] = pos;
if (!file) { console.log('usage: node imgwidths.mjs <pages.json> [key ...] [--out=<photos.json>] [--from=320] [--to=1920] [--step=20]'); process.exit(1); }
const { cfg, pages } = readWork(file);
const want = pages.filter(p => !p.of && (!keys.length || keys.includes(p.key)));
const from = Number(opts.from || 320), to = Number(opts.to || 1920), step = Number(opts.step || 20);
const widths = []; for (let w = from; w <= to; w += step) widths.push(w);
const origin = new URL(cfg.site).origin;
const LADDER = [480, 720, 1000, 1400, 2000];

const measure = () => [...document.querySelectorAll('img, video')].map(el => {
  const poster = el.tagName === 'VIDEO' ? (el.getAttribute('poster') || ([...el.attributes].find(a => /-poster$/.test(a.name)) || {}).value || '') : '';
  const src = el.tagName === 'VIDEO' ? poster : (el.getAttribute('src') || '');
  return { src: src.split(/[?#]/)[0], kind: el.tagName === 'VIDEO' ? 'poster' : 'img', w: Math.round(el.getBoundingClientRect().width * 10) / 10 };
}).filter(x => /\/wp-content\/themes\/[^/]+\/.+\.(webp|jpe?g|png|avif)$/i.test(x.src));

// sizes from [[viewport, width]]: straight segments through measured points (1.5 px tolerance).
function fit(series) {
  const pts = series.filter(([, x]) => x > 0);
  const segs = [];
  let i = 0;
  while (i < pts.length) {
    let j = i + 1;
    const fits = (a, b) => { const [w0, x0] = pts[a], [w1, x1] = pts[b]; const k = w1 === w0 ? 0 : (x1 - x0) / (w1 - w0); for (let t = a; t <= b; t++) if (Math.abs(x0 + k * (pts[t][0] - w0) - pts[t][1]) > 1.5) return null; return { k, c: x0 - k * w0 }; };
    let line = { k: 0, c: pts[i][1] };
    while (j < pts.length) { const l = fits(i, j); if (!l) break; line = l; j++; }
    segs.push({ upto: pts[j - 1][0], ...line });
    i = j;
  }
  const expr = ({ k, c }) => {
    if (Math.abs(k) < 0.0005) return `${Math.round(c)}px`;
    const vw = Math.round(k * 10000) / 100;
    return Math.abs(c) < 1 ? `${vw}vw` : `calc(${vw}vw ${c < 0 ? '-' : '+'} ${Math.abs(Math.round(c))}px)`;
  };
  const parts = [];
  segs.forEach((s, n) => {
    const e = expr(s);
    if (parts.length && parts[parts.length - 1].e === e) parts[parts.length - 1].upto = s.upto;
    else parts.push({ e, upto: s.upto });
  });
  return parts.map((p, n) => (n < parts.length - 1 ? `(max-width: ${p.upto}px) ${p.e}` : p.e)).join(', ');
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: from, height: 900 } });
const page = await ctx.newPage();
const photos = {};
let theme = '';
for (const p of want) {
  await page.setViewportSize({ width: from, height: 900 });
  await page.goto(siteUrl(cfg, p), { waitUntil: 'load' });
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(40);
    for (const m of await page.evaluate(measure)) {
      const t = m.src.match(/\/wp-content\/themes\/([^/]+)\/(.+)$/);
      theme = theme || t[1];
      const ph = (photos[t[2]] ||= { url: m.src.startsWith('http') ? m.src : origin + m.src, places: {} });
      const place = (ph.places[p.key] ||= { kind: m.kind, series: [] });
      if (!place.series.some(([v]) => v === w)) place.series.push([w, m.w]);
    }
  }
}
for (const ph of Object.values(photos)) {
  const [nw, nh] = await page.evaluate(async u => { const im = new Image(); im.src = u; try { await im.decode(); } catch (e) {} return [im.naturalWidth, im.naturalHeight]; }, ph.url);
  const head = await fetch(ph.url, { method: 'HEAD' }).catch(() => null);
  Object.assign(ph, { width: nw, height: nh, kb: Math.round(Number(head?.headers.get('content-length') || 0) / 1024) });
}
await browser.close();

const out = { site: cfg.site, theme, probed: [from, to, step], photos: {} };
console.log(`theme ${theme}; ${Object.keys(photos).length} photos, ${want.length} pages, ${widths.length} widths (${from}-${to} px, step ${step})`);
for (const [rel, ph] of Object.entries(photos)) {
  const shown = Object.values(ph.places).flatMap(pl => pl.series.map(([, x]) => x)).filter(x => x > 0);
  const min = Math.min(...shown), max = Math.max(...shown);
  const worth = ph.kb >= 30 && min * 2 < ph.width;
  const copies = worth ? LADDER.filter(c => c < ph.width && c <= max * 2) : [];
  const entry = { width: ph.width, height: ph.height, kb: ph.kb, copies, places: {} };
  console.log(`\n${rel}  ${ph.width}x${ph.height}  ${ph.kb} KB  shown ${Math.round(min)}-${Math.round(max)} px  copies: ${copies.join(', ') || 'none'}`);
  for (const [key, pl] of Object.entries(ph.places)) {
    const xs = pl.series.map(([, x]) => x).filter(x => x > 0);
    const place = { kind: pl.kind, min: Math.round(Math.min(...xs)), max: Math.round(Math.max(...xs)) };
    if (pl.kind === 'img') place.sizes = fit(pl.series.sort((a, b) => a[0] - b[0]));
    entry.places[key] = place;
    console.log(`  ${key.padEnd(14)} ${pl.kind.padEnd(6)} ${place.min}-${place.max} px  ${place.sizes ? 'sizes="' + place.sizes + '"' : '(poster: no sizes; the loader picks a copy by width)'}`);
  }
  out.photos[rel] = entry;
}
if (opts.out) { fs.writeFileSync(opts.out, JSON.stringify(out, null, 1) + '\n'); console.log(`\nwrote ${opts.out}`); }
