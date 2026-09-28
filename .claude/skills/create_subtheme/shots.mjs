// Screenshots for /create_subtheme: the claude.ai/design export (reference) and the dev site (result).
//   node shots.mjs design <export_dir> <out_dir>   renders every screen of the export's "Flujo" file
//   node shots.mjs site <url> <out_dir> <name> [pre_url]   renders one dev URL (pre_url first, e.g. an add-to-cart link)
// Each render: <name>-390.png / <name>-1440.png (full page) and <name>-390-top.png / -1440-top.png (first screen).
// Uses Playwright from PLAYWRIGHT_DIR (default: the ozone-design-system install, chromium 1208 cached).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_DIR || '/Users/pedroconsuegra/Sites/projects/ozone-design-system/.ds-sync/node_modules/playwright';
const { chromium } = await import(path.join(PW, 'index.mjs'));
const [mode, src, outDir, name, preUrl] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const TRACKERS = /googletagmanager|google-analytics|facebook\.(net|com)|tiktok|analytics\.|clarity\.ms|hotjar|doubleclick|wati\.io|connect\.facebook/;

async function shoot(browser, url, base) {
  for (const w of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**/*', r => (TRACKERS.test(r.request().url()) ? r.abort() : r.continue()));
    if (preUrl) await page.goto(preUrl, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, `${base}-${w}-top.png`) });
    // Bring lazy images in before the full-page shot.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, `${base}-${w}.png`), fullPage: true });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(base, w, 'px wide,', h, 'px tall');
    await ctx.close();
  }
}

const browser = await chromium.launch();
if (mode === 'design') {
  const server = http.createServer((req, res) => {
    const f = path.join(src, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
      res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(0);
  const port = server.address().port;
  const flow = fs.readdirSync(src).find(f => /^Flujo.*\.dc\.html$/.test(f));
  let screens = [];
  if (flow) {
    const txt = fs.readFileSync(path.join(src, flow), 'utf8');
    // Flow entries: { n, title, src } (lp2) or { id, label, src } (lp3); each src once.
    const seen = new Set();
    for (const m of txt.matchAll(/\{\s*(?:n|id):\s*'([^']+)',\s*(?:title|label):\s*'([^']+)',\s*src:\s*'([^']+)'/g)) {
      if (!seen.has(m[3])) { seen.add(m[3]); screens.push({ n: m[1], src: m[3] }); }
    }
    // lp5: the flow shows <iframe src="Producto.dc.html?pack=3"> frames instead; numbered in order.
    if (!screens.length) for (const m of txt.matchAll(/<iframe\b[^>]*\bsrc="([^"]+)"/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); screens.push({ n: String(screens.length + 1), src: m[1] }); }
    }
  }
  if (!screens.length) screens = fs.readdirSync(src).filter(f => f.endsWith('.dc.html') && !f.startsWith('Flujo')).map((f, i) => ({ n: String(i + 1), src: f }));
  for (const s of screens) await shoot(browser, `http://127.0.0.1:${port}/${s.src}`, `design-${s.n}-${s.src.replace(/\.dc\.html.*$/, '')}`);
  // Note: the design's cart lives in its localStorage; each render starts empty (default demo state).
  server.close();
} else {
  await shoot(browser, src, name || 'site');
}
await browser.close();
