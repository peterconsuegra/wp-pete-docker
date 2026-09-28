// Scroll rows of a variant (dev): arrows on phones and desktop, and autoplay that really plays.
// Usage: node rowscheck.mjs <site_url> <lp_key>
// Checks every [data-row] (not product photo galleries) on the home, a pack product page, and the
// shared ¿Quiénes Somos?, Indicaciones de uso and a blog post:
//   - a row that overflows has a visible arrow pair at 390 px and at 1440 px, except rows in a
//     first-screen section (the one holding the h1), which stay without so its buttons stay up;
//   - a row with data-autoplay moves within 3.6 s once centred, with the mouse resting in the middle
//     of the screen (the way a visitor looks at it).
// Prints one line per row and FAIL lines for what breaks those rules.
import path from 'node:path';
const PW = process.env.PLAYWRIGHT_DIR || '/Users/pedroconsuegra/Sites/projects/ozone-design-system/.ds-sync/node_modules/playwright';
const { chromium } = await import(path.join(PW, 'index.mjs'));
const [base, lp] = process.argv.slice(2);
if (!base || !lp) { console.log('Usage: node rowscheck.mjs <site_url> <lp_key>'); process.exit(1); }
const TRACKERS = /googletagmanager|google-analytics|facebook\.(net|com)|tiktok|analytics\.|clarity\.ms|hotjar|doubleclick|wati\.io/;
const host = new URL(base).hostname;
const pages = [
  ['home', '/'],
  ['product', '/product/desodorante-natural-unisex-save-a-playa-promocion-3x2/'],
  ['about', '/quienes-somos-2/'],
  ['how-to-use', '/indicaciones-de-uso/'],
  ['post', null], // the first blog post, found on /blog/
];
const browser = await chromium.launch();
let fails = 0;
for (const w of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 1000 ? 844 : 900 } });
  await ctx.addCookies([{ name: 'sap_lp', value: lp, domain: host, path: '/' }]);
  const page = await ctx.newPage();
  await page.route('**/*', r => (TRACKERS.test(r.request().url()) ? r.abort() : r.continue()));
  for (let [name, url] of pages) {
    if (!url) {
      await page.goto(base + '/blog/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
      url = await page.evaluate(() => { const a = document.querySelector('.lp-card a'); return a ? new URL(a.href).pathname : null; });
      if (!url) { console.log(w, name, 'no post card on /blog/'); continue; }
    }
    await page.goto(base + url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
    await page.mouse.move(w / 2, (w < 1000 ? 844 : 900) / 2);
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.sap-lp [data-row]'))
      .filter(r => !r.hasAttribute('data-gallery-row') && r.offsetParent !== null)
      .map((r, i) => {
        r.setAttribute('data-rowcheck', i);
        const sec = r.closest('section');
        const visibleArrows = sec ? Array.from(sec.querySelectorAll('[data-scroll]')).filter(b => b.offsetParent !== null).length : 0;
        return {
          i,
          title: ((sec && sec.querySelector('h2, h1')) || {}).textContent?.trim().slice(0, 40) || '(no title)',
          hero: !!(sec && sec.querySelector('h1')),
          overflows: r.scrollWidth > r.clientWidth + 2,
          visibleArrows,
          autoplay: r.getAttribute('data-autoplay') || '',
        };
      }));
    for (const r of rows) {
      let moved = '';
      if (r.autoplay) {
        const loc = page.locator(`[data-rowcheck="${r.i}"]`);
        await loc.evaluate(el => { el.scrollLeft = 0; el.scrollIntoView({ block: 'center', behavior: 'instant' }); });
        const a = await loc.evaluate(el => el.scrollLeft);
        await page.waitForTimeout(3600);
        const b = await loc.evaluate(el => el.scrollLeft);
        moved = b !== a ? 'plays' : 'DOES NOT PLAY';
        if (b === a) { fails++; console.log('FAIL', w, name, `"${r.title}"`, 'has data-autoplay but did not move'); }
      }
      const needArrows = r.overflows && !r.hero;
      if (needArrows && r.visibleArrows < 2) { fails++; console.log('FAIL', w, name, `"${r.title}"`, 'overflows without a visible arrow pair'); }
      console.log(String(w).padEnd(5), name.padEnd(11), `"${r.title}"`.padEnd(44), r.hero ? 'first screen' : (r.overflows ? 'overflows' : 'fits'), '| arrows', r.visibleArrows, '| autoplay', r.autoplay || '-', moved);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAIL` : 'all rows ok');
