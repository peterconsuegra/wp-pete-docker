// Every shown <img>'s box (document coordinates) and the file it loaded, per page and width, laid out
// and settled exactly as ../reblock_site/shots.mjs does: the map outside.py checks pixel differences
// against.
//   node photorects.mjs <pages.json> <out.json> [key ...] [--widths=390,1440]
// Writes { "<key>-<width>": [ { x, y, w, h, src } ] } (src without the origin); adds to an existing
// out file.
import fs from 'node:fs';
import { chromium, readWork, parseArgs, widthsOf, siteUrl, newPage, open, settle, runClicks } from '../reblock_site/lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [file, out, ...keys] = pos;
if (!file || !out) { console.log('usage: node photorects.mjs <pages.json> <out.json> [key ...] [--widths=390,1440]'); process.exit(1); }
const { cfg, pages } = readWork(file);
const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
const browser = await chromium.launch();
for (const p of pages.filter(p => !keys.length || keys.includes(p.key))) for (const w of widthsOf(opts, cfg)) {
  const { ctx, page } = await newPage(browser, w, []);
  await open(page, siteUrl(cfg, p));
  await runClicks(page, p.siteClick || p.click);
  await settle(page, { maskVideos: true });
  res[`${p.key}-${w}`] = await page.evaluate(() => [...document.images].filter(i => i.getClientRects().length).map(i => {
    const b = i.getBoundingClientRect();
    return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height, src: i.currentSrc.replace(/^https?:\/\/[^/]+/, '') };
  }));
  console.log(`${p.key} ${w}: ${res[`${p.key}-${w}`].length} images`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(out, JSON.stringify(res));
