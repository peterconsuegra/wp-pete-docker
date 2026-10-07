// Inventory of a site export for /reblock_site: what the export holds, and the work list.
//   node inventory.mjs <export_dir> <work_dir> [--site=http://x.petelocal.net] [--force]
// Reads a static HTML site (index.html + pages, css/, js/, assets/) or a claude.ai/design export
// (*.dc.html screens, a flow file, _ds/; rendering those needs internet: React and Babel from unpkg).
// Renders every page in headless Chrome, prints the report and writes <work_dir>/inventory.json and
// <work_dir>/pages.json, the work list the other tools read (an existing pages.json is kept unless --force).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, serveDir, newPage, open, parseArgs, designUrl } from './lib.mjs';

const { opts, pos } = parseArgs(process.argv.slice(2));
const [exportArg, workDir] = pos;
if (!exportArg || !workDir) { console.log('usage: node inventory.mjs <export_dir> <work_dir> [--site=URL] [--force]'); process.exit(1); }
fs.mkdirSync(workDir, { recursive: true });

// ---------- files ----------
const SKIP_DIR = /^(\.|__MACOSX$|node_modules$)/;
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('._')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(f, out); } else out.push(f);
  }
  return out;
}
// The export root is the shallowest folder holding index.html or *.dc.html (zips often add one level).
function findRoot(dir) {
  const files = fs.readdirSync(dir);
  if (files.some(f => f === 'index.html' || f.endsWith('.dc.html') || f.endsWith('.html'))) return dir;
  const subs = files.filter(f => !SKIP_DIR.test(f) && fs.statSync(path.join(dir, f)).isDirectory());
  for (const s of subs) { const r = findRoot(path.join(dir, s)); if (r) return r; }
  return null;
}
const root = findRoot(path.resolve(exportArg));
if (!root) { console.log('no index.html, *.html or *.dc.html under ' + exportArg); process.exit(1); }
const files = walk(root).map(f => path.relative(root, f));
const isDc = files.some(f => !f.includes('/') && f.endsWith('.dc.html'));
const format = isDc ? 'dc' : 'static';

// ---------- pages ----------
let pages = [];
if (format === 'static') {
  const html = files.filter(f => f.endsWith('.html') && !f.split('/').some(s => s.startsWith('_')));
  for (const f of html) {
    let key = f.replace(/\.html$/, '').replace(/(^|\/)index$/, '$1').replace(/\/$/, '').replace(/\//g, '-') || 'home';
    const p = f === 'index.html' ? '/' : '/' + f.replace(/\.html$/, '').replace(/(^|\/)index$/, '') .replace(/\/?$/, '/');
    pages.push({ key, design: f, path: p });
  }
} else {
  // Components are the screens other screens import with <dc-import name="…">.
  const components = new Set();
  for (const f of files.filter(f => f.endsWith('.dc.html'))) {
    for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/<dc-import[^>]*\bname="([^"]+)"/g)) components.add(m[1]);
  }
  const flow = files.find(f => !f.includes('/') && /(^|\s)(Flujo|Flow)\b.*\.dc\.html$/i.test(f));
  const states = [];
  if (flow) {
    const txt = fs.readFileSync(path.join(root, flow), 'utf8');
    for (const m of txt.matchAll(/\{\s*(?:n|id):\s*'([^']+)',\s*(?:title|label):\s*'([^']+)',\s*src:\s*'([^']+)'/g)) states.push({ label: m[2], src: m[3] });
    if (!states.length) for (const b of txt.matchAll(/file:\s*'([^']+)',\s*items:\s*\[([\s\S]*?)\]\s*\}/g)) {
      for (const m of b[2].matchAll(/\[\s*'([^']+)',\s*'([^']*)',\s*'([^']*)'\s*\]/g)) states.push({ label: m[2], src: b[1] + m[3] });
    }
    if (!states.length) for (const m of txt.matchAll(/<iframe\b[^>]*\bsrc="([^"]+)"/g)) states.push({ label: '', src: m[1] });
  }
  const screens = files.filter(f => !f.includes('/') && f.endsWith('.dc.html') && f !== flow && !components.has(f.replace(/\.dc\.html$/, '')));
  const keyOf = f => f.replace(/\.dc\.html$/, '').replace(/^\d+\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pathOf = k => (/^(home|inicio|index)$/.test(k) ? '/' : '/' + k + '/');
  const seen = new Set();
  for (const s of states.length ? states : screens.map(f => ({ label: '', src: f }))) {
    const src = decodeURIComponent(s.src);
    const file = src.split('?')[0];
    if (!screens.includes(file)) continue;
    const base = keyOf(file);
    if (!pages.some(p => p.key === base)) pages.push({ key: base, design: file, path: pathOf(base) });
    if (src.includes('?') && !seen.has(src)) {
      seen.add(src);
      const q = src.split('?')[1];
      pages.push({ key: base + '-' + q.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(), of: base, design: src, label: s.label });
    }
  }
  for (const f of screens) if (!pages.some(p => p.design === f)) pages.push({ key: keyOf(f), design: f, path: pathOf(keyOf(f)) });
}

// ---------- render ----------
const { server, base } = await serveDir(root);
const browser = await chromium.launch();
const report = { root, format, pages: [] };

const collect = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const cls = el => (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
  const label = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls(el).length ? '.' + cls(el).join('.') : '');
  const top = el => el.getBoundingClientRect().top + window.scrollY;
  // Landmarks: header, main's children and footer; without <main>, descend through single-child wrappers.
  let lm = [], lmSel;
  const main = document.querySelector('main');
  if (main) {
    lmSel = 'body > header, main > *, body > footer';
    lm = [...document.querySelectorAll(lmSel)];
    if (!lm.some(e => e.tagName === 'HEADER')) { const h = document.querySelector('header'); if (h) lm.unshift(h); }
    if (!lm.some(e => e.tagName === 'FOOTER')) { const f = [...document.querySelectorAll('footer')].pop(); if (f) lm.push(f); }
  } else {
    let el = document.body;
    const kids = e => [...e.children].filter(c => !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(c.tagName));
    while (kids(el).length === 1) el = kids(el)[0];
    lm = kids(el);
    const chain = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) chain.unshift(e.tagName.toLowerCase() + (e.id ? '#' + CSS.escape(e.id) : '') + (cls(e)[0] ? '.' + CSS.escape(cls(e)[0]) : ''));
    lmSel = chain.join(' > ') + ' > *';
  }
  const landmarks = lm.filter(vis).map(e => {
    const h = e.querySelector('h1,h2,h3');
    return { el: label(e), top: Math.round(top(e)), height: Math.round(e.getBoundingClientRect().height), heading: h ? h.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) : '' };
  });
  const header = document.querySelector('body > header') || document.querySelector('header, [role=banner]');
  // A menu button: aria-controls + aria-expanded in the header (the panel is the controlled element).
  const tog = header && header.querySelector('[aria-controls][aria-expanded]');
  const menu = tog ? { toggle: (cls(tog)[0] ? '.' + cls(tog)[0] : tog.tagName.toLowerCase() + '[aria-controls]'), panel: '#' + tog.getAttribute('aria-controls') } : null;
  const footers = document.querySelectorAll('footer, [role=contentinfo]');
  const footer = footers[footers.length - 1];
  const links = [...document.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), text: (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50), inHeader: !!(header && header.contains(a)) }));
  const forms = [...document.querySelectorAll('form')].map(f => ({
    el: label(f), action: f.getAttribute('action') || '', method: (f.getAttribute('method') || 'get').toLowerCase(),
    data: [...f.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name),
    fields: [...f.querySelectorAll('input,select,textarea')].map(i => (i.getAttribute('type') || i.tagName.toLowerCase()) + ':' + (i.getAttribute('name') || i.id || '?') + (i.required ? '*' : '')),
    submit: ((f.querySelector('[type=submit], button:not([type=button])') || {}).textContent || '').trim(),
  }));
  const videos = [...document.querySelectorAll('video')].map(v => ({ src: v.currentSrc || v.getAttribute('src') || (v.querySelector('source') || {}).src || '', poster: v.getAttribute('poster') || '', flags: ['autoplay', 'muted', 'loop', 'playsinline', 'controls'].filter(a => v.hasAttribute(a)).join(' ') }));
  const iframes = [...document.querySelectorAll('iframe')].map(f => f.getAttribute('src') || '');
  const images = [...document.images].map(i => ({ src: i.getAttribute('src'), broken: i.complete && i.naturalWidth === 0 }));
  // Stylesheets this page can read (same origin): media queries, custom properties, font faces, resets.
  const media = {}, props = new Set(), faces = [];
  let reset = false;
  const walkRules = rules => {
    for (const r of rules) {
      if (r.type === CSSRule.MEDIA_RULE) { media[r.conditionText] = (media[r.conditionText] || 0) + 1; walkRules(r.cssRules); }
      else if (r.type === CSSRule.SUPPORTS_RULE) walkRules(r.cssRules);
      else if (r.type === CSSRule.FONT_FACE_RULE) faces.push([r.style.getPropertyValue('font-family'), r.style.getPropertyValue('font-weight'), r.style.getPropertyValue('font-style'), (r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)/) || [])[1] || ''].join(' | '));
      else if (r.type === CSSRule.STYLE_RULE) {
        if (/(^|,)\s*(:root|html)\s*(,|$)/.test(r.selectorText)) for (const p of r.style) if (p.startsWith('--')) props.add(p);
        if (/(^|,)\s*\*\s*(,|$)/.test(r.selectorText) && r.style.getPropertyValue('box-sizing') === 'border-box') reset = true;
      }
    }
  };
  const sheets = [];
  for (const s of document.styleSheets) {
    sheets.push(s.href || '(inline <style>)');
    try { walkRules(s.cssRules); } catch (e) { /* cross-origin: Google Fonts and other CDNs */ }
  }
  const fontsLoaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family.replace(/"/g, '')} ${f.weight} ${f.style}`);
  const scripts = [...document.scripts].map(s => s.getAttribute('src') || '(inline)');
  const text = document.body.innerText || '';
  const body = getComputedStyle(document.body);
  return {
    title: document.title, description: (document.querySelector('meta[name=description]') || {}).content || '',
    h1: ((document.querySelector('h1') || {}).textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    height: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1,
    landmarks, lmSel, menu, headerHtml: header ? header.outerHTML : '', footerHtml: footer ? footer.outerHTML : '',
    links, forms, videos, iframes, images, media, props: [...props], faces, reset, sheets, scripts, fontsLoaded,
    bodyFont: body.fontFamily + ' ' + body.fontWeight + ' ' + body.fontSize + '/' + body.lineHeight, bodyBg: body.backgroundColor, bodyColor: body.color,
    emoji: (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length, emDash: (text.match(/—/g) || []).length,
  };
};

for (const p of pages) {
  const log = [];
  const external = new Set();
  const { ctx, page } = await newPage(browser, 1440, log);
  page.on('request', r => { const u = new URL(r.url()); if (u.origin !== base && /^https?:/.test(u.protocol)) external.add(u.host); });
  await open(page, designUrl(base, p));
  await page.waitForTimeout(800);
  const data = await page.evaluate(collect);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
  await ctx.close();
  report.pages.push({ ...p, ...data, height390: m.h, overflow390: m.overflow, external: [...external], log });
}
await browser.close();
server.close();

// ---------- order, titles, paths ----------
const fileToKey = Object.fromEntries(pages.filter(p => !p.of).map(p => [p.design, p.key]));
const home = report.pages.find(p => p.path === '/') || report.pages[0];
const navOrder = [];
for (const l of home.links.filter(l => l.inHeader)) {
  const target = l.href.split(/[?#]/)[0];
  const k = fileToKey[target];
  if (k && !navOrder.includes(k)) navOrder.push(k);
}
// The brand is the title segment most pages share ("About — The Play Method", "Book | Ozone Group").
const segs = t => t.split(/\s*[|\u2014\u2013\u00b7:]\s+|\s+-\s+/).map(x => x.trim()).filter(Boolean);
const freq = {};
for (const p of report.pages.filter(q => !q.of)) for (const x of new Set(segs(p.title))) freq[x] = (freq[x] || 0) + 1;
const shared = Object.entries(freq).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
const brand = shared ? shared[0] : (segs(home.title)[0] || '');
const rank = p => (p.path === '/' ? -1 : navOrder.includes(p.key) ? navOrder.indexOf(p.key) : 100);
// claude.ai/design helper screens (a phone frame around another screen) are not pages of the site.
const helper = p => p.iframes.some(f => /\.dc\.html/.test(f));
const helpers = report.pages.filter(p => !p.of && helper(p)).map(p => p.key);
const COMMERCE = /cart|carrito|checkout|order|confirm|product|producto|shop|tienda/;
const ordered = report.pages.filter(p => !p.of && !helper(p)).sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
const work = [];
for (const p of ordered) {
  const t = p.path === '/' ? 'Home' : (segs(p.title).find(x => x !== brand) || p.h1 || p.key).trim();
  work.push({ key: p.key, title: t, design: p.design, path: p.path });
  for (const s of report.pages.filter(q => q.of === p.key)) work.push({ key: s.key, of: s.of, design: s.design, ...(s.label ? { label: s.label } : {}) });
}

// ---------- header and footer variants ----------
// Tags one per line, then a line diff against the home page: what the header/footer pattern must vary.
const lines = h => h.replace(/\s+data-dc-[a-z-]+="[^"]*"/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').replace(/></g, '>\n<').split('\n').map(s => s.trim()).filter(Boolean);
function diff(a, b) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; } else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) out.push('- ' + a[i++]); else out.push('+ ' + b[j++]);
  }
  return out;
}
function variants(field) {
  const ref = lines(home[field]);
  const out = [];
  for (const p of report.pages.filter(q => !q.of && q !== home)) {
    const d = diff(ref, lines(p[field]));
    if (d.length) out.push({ key: p.key, diff: d });
  }
  return out;
}
const headerVariants = variants('headerHtml');
const footerVariants = variants('footerHtml');

// ---------- assets on disk, scripts' hooks ----------
const size = f => fs.statSync(path.join(root, f)).size;
const kind = f => (/\.(jpe?g|png|gif|webp|avif|ico)$/i.test(f) ? 'image' : /\.svg$/i.test(f) ? 'svg' : /\.(mp4|webm|mov)$/i.test(f) ? 'video' : /\.(woff2?|ttf|otf)$/i.test(f) ? 'font' : /\.css$/i.test(f) ? 'css' : /\.m?js$/i.test(f) ? 'js' : /\.html$/i.test(f) ? 'html' : 'other');
const assets = {};
for (const f of files) (assets[kind(f)] = assets[kind(f)] || []).push({ f, kb: Math.round(size(f) / 1024) });
const warnings = [];
for (const { f } of assets.svg || []) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  if (/class="/.test(t) && !/<style/.test(t)) warnings.push(`${f}: classes but no <style> (claude.ai/design strips SVG styles: it renders black)`);
}
for (const { f, kb } of assets.image || []) if (kb > 600) warnings.push(`${f}: ${kb} KB image`);
for (const { f, kb } of assets.video || []) if (kb > 6000) warnings.push(`${f}: ${(kb / 1024).toFixed(1)} MB video`);
const RUNTIME = /(^|\/)(support\.js|_ds_bundle\.js)$/;
const hooks = new Set();
for (const { f } of (assets.js || []).filter(a => !RUNTIME.test(a.f))) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of t.matchAll(/(?:querySelector(?:All)?|closest|matches)\(\s*(["'`])((?:(?!\1).)+)\1/g)) hooks.add(m[2]);
  for (const m of t.matchAll(/getElementById\(\s*["'`]([^"'`]+)/g)) hooks.add('#' + m[1]);
  for (const m of t.matchAll(/(?:get|set|has)Attribute\(\s*["'`]((?:data|aria)-[^"'`]+)/g)) hooks.add('[' + m[1] + ']');
  for (const m of t.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*["'`]([^"'`]+)/g)) hooks.add('.' + m[1] + ' (state class)');
}
const readme = files.find(f => /^readme(\.md|\.txt)?$/i.test(path.basename(f)) && !f.includes('_ds/'));

// ---------- write ----------
const allMedia = {};
for (const p of report.pages) for (const [k, v] of Object.entries(p.media)) allMedia[k] = (allMedia[k] || 0) + v;
const inventory = { ...report, brand, navOrder, headerVariants, footerVariants, assets, warnings, hooks: [...hooks], readme, media: allMedia };
fs.writeFileSync(path.join(workDir, 'inventory.json'), JSON.stringify(inventory, null, 1));
const pagesFile = path.join(workDir, 'pages.json');
const keepPages = fs.existsSync(pagesFile) && !opts.force;
if (keepPages) {
  // A run resumed in a new session: keep the edited work list, point it at this unzipped copy.
  const kept = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
  if (kept.export !== root) { kept.export = root; fs.writeFileSync(pagesFile, JSON.stringify(kept, null, 2) + '\n'); }
} else {
  const cfg = {
    name: brand, format, export: root, site: opts.site || 'http://CHANGE-ME.petelocal.net', widths: [390, 1440],
    landmarks: home.lmSel,
    menu: home.menu, pages: work,
  };
  fs.writeFileSync(pagesFile, JSON.stringify(cfg, null, 2) + '\n');
}

// ---------- report ----------
const out = [];
out.push(`EXPORT ${root}`, `format: ${format}${format === 'dc' ? ' (claude.ai/design: templates; port from the rendered DOM)' : ' (static HTML)'} · brand: ${brand || '?'}`);
out.push('', 'PAGES (work order: home, then the header nav, then the rest)');
for (const w of work) {
  const p = report.pages.find(q => q.key === w.key);
  out.push(`  ${w.of ? '  state ' : ''}${w.key.padEnd(14)} ${(w.design).padEnd(26)} ${w.of ? (w.label || '') : (w.path || '').padEnd(12) + ` h1440 ${p.height} · h390 ${p.height390}${p.overflow || p.overflow390 ? ' · OVERFLOWS' : ''} · "${p.title}"`}`);
}
if (helpers.length) out.push(`  left out (design-tool screens framing other screens): ${helpers.join(', ')}`);
const commerce = ordered.filter(p => COMMERCE.test(p.key)).map(p => p.key);
if (commerce.length) out.push(`  commerce screens (out of scope by default, agree the approach with Pedro): ${commerce.join(', ')}`);
out.push('', `LANDMARKS (pages.json "landmarks": ${home.lmSel})`);
for (const p of ordered) out.push(`  ${p.key}: ` + p.landmarks.map(l => l.el.replace(/^(\w+)\.([^.]+).*$/, '$1.$2') + ' ' + l.height).join(' · '));
out.push('', 'HEADER VARIANTS (diff vs home; the header pattern must reproduce each)');
if (!headerVariants.length) out.push('  same on every page');
for (const v of headerVariants) out.push(`  ${v.key}:`, ...v.diff.slice(0, 14).map(l => '    ' + l.slice(0, 150)), ...(v.diff.length > 14 ? [`    … ${v.diff.length - 14} more`] : []));
out.push('', 'FOOTER VARIANTS (diff vs home)');
if (!footerVariants.length) out.push('  same on every page');
for (const v of footerVariants) out.push(`  ${v.key}:`, ...v.diff.slice(0, 14).map(l => '    ' + l.slice(0, 150)), ...(v.diff.length > 14 ? [`    … ${v.diff.length - 14} more`] : []));
out.push('', 'LINKS');
for (const p of ordered) {
  const ph = p.links.filter(l => /^(#|javascript:|)$/.test(l.href));
  const ext = [...new Set(p.links.filter(l => /^https?:/.test(l.href)).map(l => new URL(l.href).host))];
  const mail = p.links.filter(l => /^(mailto|tel):/.test(l.href)).map(l => l.href);
  out.push(`  ${p.key}: ${p.links.length} links · placeholders ${ph.length}${ph.length ? ' (' + [...new Set(ph.map(l => l.text))].join(', ').slice(0, 120) + ')' : ''}${ext.length ? ' · external ' + ext.join(', ') : ''}${mail.length ? ' · ' + mail.join(', ') : ''}`);
}
const forms = report.pages.filter(p => !p.of).flatMap(p => p.forms.map(f => ({ page: p.key, ...f })));
out.push('', 'FORMS' + (forms.length ? '' : ': none'));
for (const f of forms) out.push(`  ${f.page}: ${f.el} action="${f.action}" ${f.method}${f.data.length ? ' ' + f.data.join(' ') : ''} · ${f.fields.join(', ')} · submit "${f.submit}"`);
const vids = report.pages.flatMap(p => p.videos.map(v => `${p.key}: ${v.src.replace(base, '')} [${v.flags}]${v.poster ? ' poster ' + v.poster : ''}`));
const frames = report.pages.flatMap(p => p.iframes.map(f => `${p.key}: ${f}`));
out.push('', 'MEDIA', ...(vids.length ? vids.map(v => '  video ' + v) : ['  no video']), ...frames.map(f => '  iframe ' + f));
const broken = report.pages.flatMap(p => p.images.filter(i => i.broken).map(i => `${p.key}: ${i.src}`));
if (broken.length) out.push(...broken.map(b => '  BROKEN image ' + b));
out.push('', 'CSS');
out.push('  stylesheets: ' + [...new Set(report.pages.flatMap(p => p.sheets))].map(s => s.replace(base + '/', '')).join(', '));
out.push('  breakpoints: ' + Object.keys(allMedia).sort((a, b) => (parseInt(a.match(/\d+/)) || 0) - (parseInt(b.match(/\d+/)) || 0)).join(' · '));
out.push(`  :root custom properties: ${home.props.length}${home.props.length ? ' (' + home.props.slice(0, 18).join(' ') + (home.props.length > 18 ? ' …' : '') + ')' : ''}`);
out.push('  universal box-sizing reset: ' + (home.reset ? 'yes' : 'NO (the design renders content-box: never add a global border-box rule)'));
out.push('  body: ' + home.bodyFont + ' · color ' + home.bodyColor + ' · background ' + home.bodyBg);
out.push('  @font-face in local CSS: ' + (home.faces.length ? '' : 'none'), ...home.faces.map(f => '    ' + f.replace(base + '/', '')));
out.push('  fonts loaded: ' + [...new Set(report.pages.flatMap(p => p.fontsLoaded))].join(' · '));
out.push('', 'SCRIPTS: ' + [...new Set(report.pages.flatMap(p => p.scripts))].map(s => s.replace(base + '/', '')).join(', '));
out.push('  hooks the scripts use (keep these classes, ids, data- and aria- attributes in the port): ' + [...hooks].join('  '));
out.push('', 'EXTERNAL HOSTS requested: ' + ([...new Set(report.pages.flatMap(p => p.external))].join(', ') || 'none'));
const errs = report.pages.flatMap(p => p.log.map(l => `${p.key}: ${l}`));
out.push('DESIGN ERRORS: ' + (errs.length ? '' : 'none'), ...errs.map(e => '  ' + e));
out.push('', 'ASSETS: ' + Object.entries(assets).map(([k, v]) => `${k} ${v.length} (${(v.reduce((s, a) => s + a.kb, 0) / 1024).toFixed(1)} MB)`).join(' · '));
out.push(...warnings.map(w => '  WARNING ' + w));
const emoji = report.pages.reduce((s, p) => s + p.emoji, 0), dash = report.pages.reduce((s, p) => s + p.emDash, 0);
out.push('', `COPY: emoji ${emoji} · em dashes ${dash}${emoji || dash ? ' (copy is ported verbatim unless the owner says otherwise)' : ''}`);
if (readme) out.push('', `README (${readme}):`, ...fs.readFileSync(path.join(root, readme), 'utf8').split('\n').slice(0, 40).map(l => '  | ' + l));
out.push('', `wrote ${path.join(workDir, 'inventory.json')} and ${pagesFile}${keepPages ? ' (kept the existing pages.json, export path updated: --force rewrites it)' : ''}`);
console.log(out.join('\n'));
