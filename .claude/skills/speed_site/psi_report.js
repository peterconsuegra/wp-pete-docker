// PageSpeed Insights, read from its own report page (the keyless API runs out of daily quota).
// 1. In the built-in browser open https://pagespeed.web.dev/report?url=<encoded URL>&form_factor=mobile
// 2. When the address becomes /analysis/<site>/<id>?…, navigate to that address again: the reloaded
//    page carries the whole report in a script.
// 3. Run this file's text with the browser's javascript tool. It returns one line per form factor:
//    score, the scored metrics, the OBSERVED timings of Google's unthrottled run (PSI's phone Speed
//    Index is mostly 1.4 × the observed one), the long main-thread tasks, each image/video/script/font
//    request (start-end ms), and the insights that failed. window.__lhrs keeps the full reports.
(() => {
  const s = [...document.scripts].find(x => x.textContent.includes('screenshot-thumbnails'));
  if (!s) return 'no report in this page yet: wait for /analysis/…, then load that address again';
  let got;
  (new Function('AF_initDataCallback', s.textContent))(o => { got = o; });
  const lhrs = [];
  const walk = v => {
    if (typeof v === 'string') { if (v.startsWith('{') && v.includes('"lighthouseVersion"')) { try { lhrs.push(JSON.parse(v)); } catch (e) {} } }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(got.data);
  window.__lhrs = lhrs;
  return lhrs.map(L => {
    const a = L.audits, m = a.metrics.details.items[0], o = k => Math.round(m['observed' + k]);
    const reqs = a['network-requests'].details.items.filter(r => /\.(webp|jpe?g|png|avif|svg|mp4|webm|woff2|js)(\?|$)/.test(r.url))
      .map(r => `${r.url.split('/').pop().split('?')[0].slice(0, 32)}@${Math.round(r.networkRequestTime)}-${Math.round(r.networkEndTime)}`);
    const tasks = (a['main-thread-tasks']?.details.items || []).filter(t => t.duration > 30).map(t => `${Math.round(t.startTime)}+${Math.round(t.duration)}`);
    const failed = Object.entries(a).filter(([k, v]) => k.endsWith('-insight') && v.score !== null && v.score < 1).map(([k, v]) => `${k.replace('-insight', '')}${v.displayValue ? ' (' + v.displayValue + ')' : ''}`);
    return `${L.configSettings.formFactor} ${L.finalDisplayedUrl}: score ${Math.round(L.categories.performance.score * 100)} | FCP ${Math.round(a['first-contentful-paint'].numericValue)} LCP ${Math.round(a['largest-contentful-paint'].numericValue)} SI ${Math.round(a['speed-index'].numericValue)} TBT ${Math.round(a['total-blocking-time'].numericValue)} CLS ${a['cumulative-layout-shift'].numericValue.toFixed(3)}`
      + ` | observed DCL ${o('DomContentLoaded')} load ${o('Load')} FCP ${o('FirstContentfulPaint')} LCP ${o('LargestContentfulPaint')} SI ${o('SpeedIndex')}`
      + ` | long tasks ${tasks.join(' ') || 'none'} | ${reqs.join(' ')} | failed insights: ${failed.join(', ') || 'none'} | Chrome ${(L.environment.hostUserAgent.match(/Chrome\/([\d.]+)/) || [])[1]}, benchmark ${L.environment.benchmarkIndex}`;
  });
})()
