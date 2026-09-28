// Console errors and failed requests on a variant's screens (dev), plus the header menu.
// Usage: node jscheck.mjs <site_url> <lp_key> [screens|pages|all]   (default all)
//   screens: home, product, cart (adds a pack), checkout; pages: the menu's pages and a blog post.
import path from 'node:path';
const PW = process.env.PLAYWRIGHT_DIR || '/Users/pedroconsuegra/Sites/projects/ozone-design-system/.ds-sync/node_modules/playwright';
const { chromium } = await import(path.join(PW, 'index.mjs'));
const [base, lp, which = 'all'] = process.argv.slice(2);
const TRACKERS = /googletagmanager|google-analytics|facebook\.(net|com)|tiktok|analytics\.|clarity\.ms|hotjar|doubleclick|wati\.io/;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.route('**/*', r => (TRACKERS.test(r.request().url()) ? r.abort() : r.continue()));
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));
page.on('requestfailed', r => { if (!TRACKERS.test(r.url())) errors.push('failed: ' + r.url().slice(0, 120)); });
const screens = [['home', `${base}/?lp=${lp}`], ['product', `${base}/product/desodorante-natural-unisex-save-a-playa-promocion-3x2/`], ['cart', `${base}/carrito/?add-to-cart=29087`], ['checkout', `${base}/checkout-2/`]];
const pages = [['about', `${base}/quienes-somos-2/?lp=${lp}`], ['volunteers', `${base}/voluntarios/`], ['how-to-use', `${base}/indicaciones-de-uso/`], ['blog', `${base}/blog/`]];
const list = which === 'screens' ? screens : which === 'pages' ? pages : screens.concat(pages);
for (const [name, url] of list) {
  const before = errors.length;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(e => errors.push('goto ' + e.message));
  await page.waitForTimeout(1200);
  const variant = await page.evaluate(k => !!document.querySelector('.sap-lp.sap-' + k), lp);
  console.log(name.padEnd(10), 'variant:', variant, '| errors:', errors.slice(before));
  // The blog page leads to a post: check the first one too.
  if (name === 'blog') {
    const post = await page.evaluate(() => { const a = document.querySelector('.lp-card a'); return a && a.href; });
    if (post) {
      const b = errors.length;
      await page.goto(post, { waitUntil: 'networkidle', timeout: 90000 }).catch(e => errors.push('goto ' + e.message));
      await page.waitForTimeout(1200);
      const v = await page.evaluate(k => !!document.querySelector('.sap-lp.sap-' + k), lp);
      console.log('post'.padEnd(10), 'variant:', v, '| errors:', errors.slice(b));
    }
  }
}
// Header menu: opens with its links, closes on Escape (checked on the last page loaded).
const btn = await page.$('.sap-lp [data-menu]');
if (btn) {
  await btn.click();
  const open = await page.evaluate(() => { const m = document.getElementById('lp-menu'); return m && !m.hidden && m.getBoundingClientRect().height > 0 ? m.querySelectorAll('a').length : 0; });
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => document.getElementById('lp-menu').hidden);
  console.log('menu'.padEnd(10), 'links when open:', open, '| closed on Escape:', closed);
} else {
  console.log('menu'.padEnd(10), 'MISSING: no [data-menu] button on the last page (every variant screen has the menu)');
}
await browser.close();
