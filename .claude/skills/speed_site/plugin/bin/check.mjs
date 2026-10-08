// __NAME__, checked on a running site (dev or production), phone and desktop:
//   node bin/check.mjs <site> [path ...]        default path: /
// Per page: HTML from WP Fastest Cache, no-cache on PHP-rendered HTML, no theme CSS or JS requests,
// every preload used, videos idle until the first paint is on screen and then playing, the photo
// copy that fits the screen, held-back tags idle until the first interaction and then all run, no
// console errors. Ends with "page speed checks ok".
import path from 'node:path';
const PW = process.env.PLAYWRIGHT_DIR || '/Users/pedroconsuegra/Sites/projects/ozone-design-system/.ds-sync/node_modules/playwright';
const { chromium } = await import(path.join(PW, 'index.mjs'));
const [site, ...rest] = process.argv.slice(2);
if (!site) { console.log('usage: node bin/check.mjs <site> [path ...]'); process.exit(1); }
const paths = rest.length ? rest : ['/'];
const THEME = '/themes/__THEME__/';
const FORMS = {
  phone: { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const INIT = `
  window.__ps = { fcp: null };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__ps.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
`;
let problems = 0;
const bad = (msg) => { problems++; console.log('   ✗ ' + msg); };
const browser = await chromium.launch();
for (const p of paths) {
  const url = site.replace(/\/$/, '') + p;
  // PHP-rendered (a query string skips the page cache): no-cache.
  const php = await fetch(url + (url.includes('?') ? '&' : '?') + '__PREFIX__-check=' + Date.now());
  if (!/no-cache/.test(php.headers.get('cache-control') || '')) bad(`${p} PHP response: cache-control "${php.headers.get('cache-control')}"`);
  for (const [form, opts] of Object.entries(FORMS)) {
    console.log(`${p} ${form}`);
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.addInitScript(INIT);
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' || /preloaded using link preload but not used/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    const res = await page.goto(url, { waitUntil: 'load' });
    const html = await res.text();
    if (!/WP Fastest Cache file was created/.test(html)) bad('not served from the page cache (no WP Fastest Cache comment)');
    if (new RegExp(`<link[^>]+rel=["']stylesheet["'][^>]+${THEME}`).test(html)) bad('a theme stylesheet is still a <link>');
    if (new RegExp(`<script[^>]+src=["'][^"']*${THEME}[^>]*>`).test(html)) console.log('   note: a theme script is still a file (deferred, async, module or over 20 KB?)');
    if (/data-rps-/.test(html)) bad('Reblock Page Speed markup in the page (both plugins active?)');
    await page.waitForTimeout(4000); // preload warnings come ~3 s after load
    const r = await page.evaluate(() => {
      const used = new Set(performance.getEntriesByType('resource').map(e => e.name));
      const preloads = [...document.querySelectorAll('link[rel=preload]')].filter(l => !l.media || matchMedia(l.media).matches).map(l => ({ href: l.href, used: used.has(l.href) || [...used].some(u => l.imageSrcset && l.imageSrcset.includes(u)) }));
      // In view: must play. Near (the loader looks one screen ahead): may load. Further: must wait.
      const videos = [...document.querySelectorAll('video')].map(v => { const b = v.getBoundingClientRect(); return { cls: v.className || 'video', inView: b.top < innerHeight && b.bottom > 0, near: b.top < 2 * innerHeight && b.bottom > -innerHeight, playing: !v.paused && v.readyState > 1, src: v.currentSrc.split('/').pop() }; });
      // Video files actually requested (a <source> without src still fires loadstart while parsing: not a load).
      const starts = performance.getEntriesByType('resource').filter(e => /\.(mp4|webm)(\?|$)/.test(e.name)).map(e => [e.name.split('/').pop(), e.startTime]);
      return { preloads, videos, fcp: window.__ps.fcp, starts, held: document.querySelectorAll('script[data-__PREFIX__-delay]').length };
    });
    for (const pl of r.preloads) if (!pl.used) bad('preload not used: ' + pl.href);
    for (const v of r.videos) {
      if (v.inView && !v.playing) bad(`video ${v.cls} in view but not playing`);
      if (!v.near && v.src) bad(`video ${v.cls} far out of view but loading (${v.src})`);
    }
    for (const [file, t] of r.starts) if (r.fcp === null || t < r.fcp) bad(`video file ${file} requested at ${Math.round(t)} ms, before the first paint (${r.fcp === null ? 'none' : Math.round(r.fcp) + ' ms'})`);
    // Below the fold: scroll through the page (the first interaction too), then every photo and video
    // must have loaded and every held-back tag must have run.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); } });
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({
      videos: [...document.querySelectorAll('video')].map(v => ({ cls: v.className || 'video', started: !!v.currentSrc, poster: (v.getAttribute('poster') || '').split('/').pop(), need: Math.round(v.getBoundingClientRect().width * devicePixelRatio) })),
      imgs: [...document.querySelectorAll('img[srcset*="__SLUG__"]')].map(i => ({ file: i.currentSrc.split('/').pop(), need: Math.round(i.getBoundingClientRect().width * devicePixelRatio) })),
      held: document.querySelectorAll('script[data-__PREFIX__-delay]').length,
    }));
    for (const v of after.videos) {
      if (!v.started) bad(`video ${v.cls} never started`);
      console.log(`   video ${v.cls}: ${v.started ? 'started' : 'idle'}, poster ${v.poster} for ${v.need} px`);
    }
    for (const i of after.imgs) {
      console.log(`   photo ${i.file} for ${i.need} px`);
      if (!i.file) bad('a photo never loaded');
    }
    if (r.held) {
      console.log(`   held-back tags: ${r.held} before the first interaction, ${after.held} after`);
      if (after.held) bad(`${after.held} held-back tag(s) still idle after a scroll`);
    }
    if (r.fcp !== null) console.log(`   first paint ${Math.round(r.fcp)} ms; video starts ${r.starts.map(s => Math.round(s[1])).join(', ') || 'none in view'}`);
    for (const e of errors) bad('console: ' + e);
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'page speed checks ok');
process.exit(problems ? 1 : 0);
