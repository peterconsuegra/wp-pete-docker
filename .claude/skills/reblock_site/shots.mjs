// Screenshots of the design (the export, served locally) and of the port (the dev site), same widths,
// same settling, so compare.py can put them side by side.
//   node shots.mjs <pages.json> design|site <out_dir> [key ...] [--widths=390,1440] [--html] [--tag=<name>]
//   node shots.mjs url <url> <out_dir> <name> [--widths=390,1440]
// Writes <key>-<w>-<mode>.png (full page; pages taller than 15000 px come as -t1, -t2 … tiles, which
// compare.py stitches) and <key>-<w>-top-<mode>.png (the first screen). --html also saves the rendered
// DOM as <key>-<w>-<mode>.html: for claude.ai/design templates it is the markup to port. --tag names
// the files instead of the mode (site before/after a change: --tag=before, --tag=after).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, serveDir, readWork, parseArgs, widthsOf, designUrl, siteUrl, newPage, open, settle, runClicks } from './lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [first, mode, outDir, ...rest] = pos;
if (!first || !mode || !outDir) {
  console.log('usage: node shots.mjs <pages.json> design|site <out_dir> [key ...] [--widths=390,1440] [--html]\n       node shots.mjs url <url> <out_dir> <name>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const TILE = 8000, MAX = 15000;
async function shoot(browser, url, name, tag, widths, clicks) {
  for (const w of widths) {
    const log = [];
    const { ctx, page } = await newPage(browser, w, log);
    await open(page, url);
    await runClicks(page, clicks);
    await settle(page);
    const stem = path.join(outDir, `${name}-${w}`);
    for (const f of fs.readdirSync(outDir)) if (f.startsWith(`${name}-${w}-${tag}`) || f === `${name}-${w}-top-${tag}.png`) fs.unlinkSync(path.join(outDir, f));
    await page.screenshot({ path: `${stem}-top-${tag}.png` });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h <= MAX) await page.screenshot({ path: `${stem}-${tag}.png`, fullPage: true });
    else for (let y = 0, i = 1; y < h; y += TILE, i++) await page.screenshot({ path: `${stem}-${tag}-t${i}.png`, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(TILE, h - y) } });
    if (opts.html) {
      const html = await page.evaluate(() => {
        const d = document.documentElement.cloneNode(true);
        d.querySelectorAll('script').forEach(s => s.remove());
        d.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => { if (a.name.startsWith('data-dc-')) el.removeAttribute(a.name); }));
        return '<!doctype html>\n' + d.outerHTML;
      });
      fs.writeFileSync(`${stem}-${tag}.html`, html);
    }
    console.log(`${name.padEnd(16)} ${String(w).padStart(4)} ${tag.padEnd(6)} ${String(h).padStart(6)} px${h > MAX ? ' (tiles)' : ''}${log.length ? '  ' + log.join(' | ') : ''}`);
    await ctx.close();
  }
}

const browser = await chromium.launch();
if (first === 'url') {
  await shoot(browser, mode, rest[0] || 'page', opts.tag || 'site', widthsOf(opts, null), []);
} else {
  const { cfg, pages } = readWork(first);
  const want = rest.length ? pages.filter(p => rest.includes(p.key)) : pages;
  if (!want.length) { console.log('no such page key: ' + rest.join(' ')); process.exit(1); }
  let server, base;
  if (mode === 'design') ({ server, base } = await serveDir(cfg.export));
  for (const p of want) {
    const url = mode === 'design' ? designUrl(base, p) : siteUrl(cfg, p);
    const clicks = mode === 'site' && p.siteClick ? p.siteClick : p.click;
    await shoot(browser, url, p.key, opts.tag || mode, widthsOf(opts, cfg), clicks);
  }
  if (server) server.close();
}
await browser.close();
