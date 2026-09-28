// Viewport screenshots after scrolling, for what a full-page shot cannot show: sticky and fixed
// elements (a design's sticky gallery pinned over the title on phones, lp4 and lp5; when the buy
// bar appears). One PNG per scroll position plus <out_prefix>.png with them side by side.
//   node scrollshots.mjs design <export_dir> "<Screen.dc.html?state>" <width> <out_prefix> <y> [<y> ...]
//   node scrollshots.mjs site <lp_key> "<url>" <width> <out_prefix> <y> [<y> ...]
// Site mode sets the sap_lp cookie; PRE=<url> loads first (the checkout needs an add-to-cart link:
// with an empty cart it redirects to the cart). Height: 844 at 390 px, else 900.
// Uses Playwright from PLAYWRIGHT_DIR (as shots.mjs).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_DIR || '/Users/pedroconsuegra/Sites/projects/ozone-design-system/.ds-sync/node_modules/playwright';
const { chromium } = await import(path.join(PW, 'index.mjs'));
const [mode, src, page, w, out, ...ys] = process.argv.slice(2);
if (!['design', 'site'].includes(mode) || !ys.length) {
	console.log('usage: scrollshots.mjs design|site <export_dir|lp_key> <screen|url> <width> <out_prefix> <y>...');
	process.exit(1);
}
const TRACKERS = /googletagmanager|google-analytics|facebook\.(net|com)|tiktok|analytics\.|clarity\.ms|hotjar|doubleclick|wati\.io|connect\.facebook/;
const width = Number(w), height = width === 390 ? 844 : 900;

let server, url = page;
if (mode === 'design') {
	server = http.createServer((req, res) => {
		const f = path.join(src, decodeURIComponent(req.url.split('?')[0]));
		fs.readFile(f, (err, data) => {
			if (err) { res.writeHead(404); return res.end(); }
			const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
			res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' });
			res.end(data);
		});
	}).listen(0);
	url = `http://127.0.0.1:${server.address().port}/${page}`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
if (mode === 'site') {
	await ctx.addCookies([{ name: 'sap_lp', value: src, domain: new URL(url).hostname, path: '/' }]);
}
const p = await ctx.newPage();
await p.route('**/*', r => (TRACKERS.test(r.request().url()) ? r.abort() : r.continue()));
if (process.env.PRE) await p.goto(process.env.PRE, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
await p.waitForTimeout(1500);
const files = [];
for (const y of ys) {
	await p.evaluate(y => window.scrollTo({ top: Number(y), behavior: 'instant' }), y);
	await p.waitForTimeout(800);
	const f = `${out}-${y}.png`;
	await p.screenshot({ path: f });
	files.push(f);
}
// The strip: the shots side by side, drawn in a blank page (no image library needed).
const imgs = files.map(f => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="display:block;width:${width}px;height:${height}px">`).join('');
const strip = await ctx.newPage();
await strip.setViewportSize({ width: files.length * (width + 12), height });
await strip.setContent(`<body style="margin:0;display:flex;gap:12px;background:#fff">${imgs}</body>`);
await strip.screenshot({ path: `${out}.png` });
console.log(`${out}.png (${files.length} positions: ${ys.join(', ')})`);
await browser.close();
if (server) server.close();
