// Proof that the speed features work on each page, not just that the score moved.
//   node speedcheck.mjs <pages.json> [key ...]
// Per page: the second request comes from WP Fastest Cache without PHP; a PHP-rendered copy
// (?rps-check=1, never cached) says no-cache; the theme's CSS is inline (no theme stylesheet links);
// the preloads are there and Chrome uses them (it warns about an unused preload); videos have no file
// until the page has loaded, then the ones in view load and play, and the rest once scrolled near;
// no console errors. Ends with "speed checks ok" or the problems.
import { chromium, readWork, parseArgs, siteUrl, newPage } from '../reblock_site/lib.mjs';

const { pos } = parseArgs(process.argv.slice(2));
const [file, ...keys] = pos;
if (!file) { console.log('usage: node speedcheck.mjs <pages.json> [key ...]'); process.exit(1); }
const { cfg, pages } = readWork(file);
const want = pages.filter(p => !p.of && (!keys.length || keys.includes(p.key)));
const problems = [];
const browser = await chromium.launch();

for (const p of want) {
  const url = siteUrl(cfg, p);
  const found = [], notes = [];
  // Cache: the first request may create the file, the second must come from it.
  await fetch(url);
  const cached = await fetch(url);
  const body = await cached.text();
  if (!/WP Fastest Cache file was created/.test(body)) found.push('not served from WP Fastest Cache');
  else if (/via php/.test(body)) found.push('cached, but served through PHP (WP Fastest Cache .htaccess rules missing)');
  else notes.push('cache: Apache serves the saved page');
  notes.push(`cached HTML: Cache-Control "${cached.headers.get('cache-control') || '-'}", ${cached.headers.get('content-encoding') || 'no'} compression`);
  // A PHP-rendered copy (WP Fastest Cache never serves a query string from the cache).
  const php = await fetch(url + (url.includes('?') ? '&' : '?') + 'rps-check=1');
  const html = (await php.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const cc = php.headers.get('cache-control') || '';
  if (!/no-cache/.test(cc)) found.push(`PHP-rendered HTML without no-cache (Cache-Control "${cc || '-'}")`);
  const slug = (/wp-theme-([a-z0-9-]+)/.exec(html) || [])[1] || '';
  const themeLinks = (html.match(new RegExp(`<link[^>]+rel=['"]stylesheet['"][^>]+/themes/${slug}/`, 'g')) || []).length;
  const inline = (html.match(new RegExp(`<style id="${slug}-[a-z]+-css">`, 'g')) || []).length;
  if (themeLinks) found.push(`${themeLinks} theme stylesheet link(s) still render-blocking`);
  const imgPre = (html.match(/<link rel="preload" as="image"[^>]*fetchpriority="high"/g) || []).length;
  const fontPre = (html.match(/<link rel="preload" as="font"/g) || []).length;
  const videos = (html.match(/<video\b/g) || []).length, lazy = (html.match(/data-rps-video/g) || []).length;
  if (videos && lazy < videos) found.push(`${videos - lazy} video(s) not deferred`);
  notes.push(`inline theme CSS ${inline} · image preloads ${imgPre} · font preloads ${fontPre} · videos ${videos} (deferred ${lazy})`);

  // In a browser: preloads used, videos start after load and when near, no errors.
  const log = [];
  const { ctx, page } = await newPage(browser, 390, log);
  const warnings = [];
  page.on('console', m => { if (m.type() === 'warning' && /preload/i.test(m.text())) warnings.push(m.text().slice(0, 160)); });
  await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(e => found.push('goto ' + e.message.split('\n')[0]));
  await page.waitForTimeout(2500);
  const inView = await page.evaluate(() => [...document.querySelectorAll('video')].filter(v => v.getBoundingClientRect().top < innerHeight * 2)
    .map(v => ({ cls: v.className, src: !!(v.currentSrc || v.getAttribute('src')), ready: v.readyState, playing: v.autoplay ? !v.paused : null })));
  for (const v of inView) if (!v.src || v.ready < 2 || v.playing === false) found.push(`video ${v.cls || '?'} near the top: file ${v.src ? 'set' : 'MISSING'}, readyState ${v.ready}, ${v.playing === false ? 'NOT playing' : 'ok'}`);
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); } });
  await page.waitForTimeout(2500);
  const all = await page.evaluate(() => [...document.querySelectorAll('video')].map(v => ({ cls: v.className, ready: v.readyState, playing: v.autoplay ? !v.paused : null })));
  for (const v of all) if (v.ready < 2 || v.playing === false) found.push(`video ${v.cls || '?'} after scrolling: readyState ${v.ready}, ${v.playing === false ? 'NOT playing' : 'ok'}`);
  if (all.length) notes.push(`videos playing after scroll: ${all.filter(v => v.playing !== false && v.ready >= 2).length}/${all.length}`);
  found.push(...warnings.map(w => 'unused or wrong preload: ' + w), ...log);
  await ctx.close();

  console.log(`${p.key}: ${found.length ? found.length + ' problem(s)' : 'ok'}`);
  for (const n of notes) console.log('   ' + n);
  for (const f of found) console.log('   PROBLEM ' + f);
  problems.push(...found.map(f => `${p.key}: ${f}`));
}
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n` + problems.map(p => '  ' + p).join('\n') : '\nspeed checks ok');
