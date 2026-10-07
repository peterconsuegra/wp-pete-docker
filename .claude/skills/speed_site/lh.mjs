// Lighthouse over a site's pages: performance only, phone and desktop, median of several runs.
//   node lh.mjs <pages.json> <out_dir> [key ...] [--runs=3] [--form=mobile,desktop] [--compare=<before_dir>]
// pages.json is /reblock_site's work list (its "site" + each page's "path"; states are skipped).
// Writes every report (<key>-<form>-<n>.json) and summary.json (per-metric medians) to out_dir and
// prints the table; --compare prints before → after from another run's summary.json.
// Lighthouse from LIGHTHOUSE_BIN or ~/.cache/claude-skills/lighthouse (npm install lighthouse there).
// Chrome runs with HTTPS-Upgrades off: an http:// dev site would otherwise pay a failed https try.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [pagesFile, outDir, ...keys] = args.filter(a => !a.startsWith('--'));
if (!pagesFile || !outDir) { console.log('usage: node lh.mjs <pages.json> <out_dir> [key ...] [--runs=3] [--form=mobile,desktop] [--compare=<dir>]'); process.exit(1); }
const LH = process.env.LIGHTHOUSE_BIN || path.join(os.homedir(), '.cache/claude-skills/lighthouse/node_modules/.bin/lighthouse');
if (!fs.existsSync(LH)) {
  console.log(`no Lighthouse at ${LH}\ninstall: mkdir -p ~/.cache/claude-skills/lighthouse && cd ~/.cache/claude-skills/lighthouse && npm init -y && npm install lighthouse`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const cfg = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
const pages = cfg.pages.filter(p => !p.of && (!keys.length || keys.includes(p.key)));
const runs = Number(opts.runs || 3);
const forms = String(opts.form || 'mobile,desktop').split(',');
const FLAGS = '--headless=new --disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable --no-first-run --no-default-browser-check';

function metrics(report) {
  const a = report.audits;
  const num = id => (a[id] && typeof a[id].numericValue === 'number' ? a[id].numericValue : null);
  const lcpNode = ((a['lcp-breakdown-insight'] || {}).details || {}).items || [];
  const node = lcpNode.find(i => i.type === 'node') || {};
  const blocking = (((a['render-blocking-insight'] || {}).details || {}).items || []).length;
  return {
    score: Math.round((report.categories.performance.score || 0) * 100),
    fcp: num('first-contentful-paint'), lcp: num('largest-contentful-paint'), tbt: num('total-blocking-time'),
    cls: num('cumulative-layout-shift'), si: num('speed-index'), ttfb: num('server-response-time'),
    kb: Math.round((num('total-byte-weight') || 0) / 1024),
    requests: (((a['network-requests'] || {}).details || {}).items || []).length,
    blocking, lcpElement: (node.selector || '').replace(/^.*> /, '') + (node.snippet ? '  ' + node.snippet.slice(0, 90) : ''),
  };
}
const median = xs => { const v = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };

const summary = {};
for (const p of pages) {
  const url = new URL(p.path || '/', cfg.site).href;
  summary[p.key] = {};
  for (const form of forms) {
    const all = [];
    for (let n = 1; n <= runs; n++) {
      const file = path.join(outDir, `${p.key}-${form}-${n}.json`);
      const lhArgs = [url, '--quiet', '--only-categories=performance', '--output=json', `--output-path=${file}`, `--chrome-flags=${FLAGS}`];
      if (form === 'desktop') lhArgs.push('--preset=desktop');
      const r = spawnSync(LH, lhArgs, { encoding: 'utf8', timeout: 180000 });
      if (r.status !== 0 || !fs.existsSync(file)) { console.log(`  ${p.key} ${form} run ${n} failed: ${(r.stderr || '').split('\n').slice(-3).join(' ')}`); continue; }
      all.push(metrics(JSON.parse(fs.readFileSync(file, 'utf8'))));
    }
    if (!all.length) continue;
    const med = {};
    for (const k of ['score', 'fcp', 'lcp', 'tbt', 'cls', 'si', 'ttfb', 'kb', 'requests', 'blocking']) med[k] = median(all.map(m => m[k]));
    const mid = all.slice().sort((a, b) => a.score - b.score)[Math.floor((all.length - 1) / 2)];
    med.lcpElement = mid.lcpElement;
    med.scores = all.map(m => m.score);
    summary[p.key][form] = med;
    process.stdout.write(`${p.key} ${form}: ${med.scores.join('/')}\n`);
  }
}
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));

const s = v => (v == null ? '-' : v >= 100 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms');
const row = (m) => `${String(m.score).padStart(3)}  FCP ${s(m.fcp).padStart(6)}  LCP ${s(m.lcp).padStart(6)}  TBT ${String(Math.round(m.tbt)).padStart(4)} ms  CLS ${(m.cls ?? 0).toFixed(3)}  SI ${s(m.si).padStart(6)}  TTFB ${String(Math.round(m.ttfb ?? 0)).padStart(4)} ms  ${String(m.kb).padStart(5)} KB  ${String(m.requests).padStart(3)} req  ${m.blocking} blocking`;
console.log(`\nmedian of ${runs} run(s)`);
const before = opts.compare ? JSON.parse(fs.readFileSync(path.join(opts.compare, 'summary.json'), 'utf8')) : null;
for (const [key, byForm] of Object.entries(summary)) {
  for (const [form, m] of Object.entries(byForm)) {
    const b = before && before[key] && before[key][form];
    if (b) {
      console.log(`${key.padEnd(14)} ${form.padEnd(7)} before ${row(b)}`);
      console.log(`${''.padEnd(22)} after  ${row(m)}`);
    } else {
      console.log(`${key.padEnd(14)} ${form.padEnd(7)} ${row(m)}`);
    }
    console.log(`${''.padEnd(22)} LCP element: ${m.lcpElement || '?'}`);
  }
}
