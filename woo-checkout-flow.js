import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// Count statuses explicitly (so you see them in the summary)
const add_s0 = new Counter('add_status_0');
const add_s200 = new Counter('add_status_200');
const add_s302 = new Counter('add_status_302');
const add_s403 = new Counter('add_status_403');
const add_s429 = new Counter('add_status_429');
const add_s5xx = new Counter('add_status_5xx');
const add_sOther = new Counter('add_status_other');

const chk_s0 = new Counter('checkout_status_0');
const chk_s200 = new Counter('checkout_status_200');
const chk_s302 = new Counter('checkout_status_302');
const chk_s403 = new Counter('checkout_status_403');
const chk_s429 = new Counter('checkout_status_429');
const chk_s5xx = new Counter('checkout_status_5xx');
const chk_sOther = new Counter('checkout_status_other');

// Track network failures by k6 error_code (only meaningful when status==0)
const add_err = new Counter('add_errcode');
const chk_err = new Counter('checkout_errcode');

export const options = {
  scenarios: {
    checkout_flow: {
      executor: 'constant-arrival-rate',
      rate: __ENV.RATE ? parseFloat(__ENV.RATE) : 5, // iters per second
      timeUnit: '1s',
      duration: __ENV.DURATION || '1m',
      preAllocatedVUs: __ENV.PRE_VUS ? parseInt(__ENV.PRE_VUS, 10) : 60,
      maxVUs: __ENV.MAX_VUS ? parseInt(__ENV.MAX_VUS, 10) : 120,
      gracefulStop: '30s',
    },
  },
};

const BASE = __ENV.BASE_URL || 'https://staging2.saveaplaya.org';
const PRODUCT_ID = __ENV.PRODUCT_ID || '29087';
const QTY = __ENV.QTY || '1';
const CHECKOUT_PATH = __ENV.CHECKOUT_PATH || '/checkout-2/';

// Print only the first N failures to keep logs readable
const MAX_DEBUG_LINES = __ENV.DEBUG_LINES ? parseInt(__ENV.DEBUG_LINES, 10) : 20;
let debugLines = 0;

function bumpStatusCounters(prefix, res) {
  const s = res.status;

  // status==0 is usually network/TLS/timeout/connection reset
  if (s === 0) {
    if (prefix === 'add') add_s0.add(1);
    else chk_s0.add(1);

    const code = res.error_code ? String(res.error_code) : 'none';
    if (prefix === 'add') add_err.add(1, { code });
    else chk_err.add(1, { code });

    if (debugLines < MAX_DEBUG_LINES) {
      debugLines += 1;
      console.warn(
        `[${prefix}] status=0 error_code=${code} error=${res.error ? res.error : 'none'} url=${res.url}`
      );
    }
    return;
  }

  // Normal HTTP statuses
  const is5xx = s >= 500 && s <= 599;
  const isOther = ![200, 302, 403, 429].includes(s) && !is5xx;

  const add = (metric) => metric.add(1);

  if (prefix === 'add') {
    if (s === 200) add(add_s200);
    else if (s === 302) add(add_s302);
    else if (s === 403) add(add_s403);
    else if (s === 429) add(add_s429);
    else if (is5xx) add(add_s5xx);
    else if (isOther) add(add_sOther);
  } else {
    if (s === 200) add(chk_s200);
    else if (s === 302) add(chk_s302);
    else if (s === 403) add(chk_s403);
    else if (s === 429) add(chk_s429);
    else if (is5xx) add(chk_s5xx);
    else if (isOther) add(chk_sOther);
  } 

  // Log a few non-OK statuses
  if ((s !== 200 && s !== 302) && debugLines < MAX_DEBUG_LINES) {
    debugLines += 1;
    console.warn(`[${prefix}] status=${s} url=${res.url}`);
  }
}

export default function () {
  // 1) Add to cart
  const addUrl = `${BASE}/?wc-ajax=add_to_cart`;
  const addBody = `product_id=${encodeURIComponent(PRODUCT_ID)}&quantity=${encodeURIComponent(QTY)}`;

  const addRes = http.post(addUrl, addBody, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
    },
    redirects: 0,
    tags: { name: 'wc-ajax:add_to_cart' },
    timeout: __ENV.TIMEOUT || '30s',
  });

  bumpStatusCounters('add', addRes);

  check(addRes, {
    'add_to_cart status 200': (r) => r.status === 200,
    'add_to_cart returned fragments/cart': (r) => {
      if (r.status !== 200) return false;
      try {
        const j = r.json();
        return j && (j.fragments || j.cart_hash || j.cart_key);
      } catch (e) {
        return false;
      }
    },
  });

  // 2) Checkout
  const checkoutUrl = `${BASE}${CHECKOUT_PATH}`;
  const checkoutRes = http.get(checkoutUrl, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirects: 0,
    tags: { name: 'page:checkout' },
    timeout: __ENV.TIMEOUT || '30s',
  });

  bumpStatusCounters('checkout', checkoutRes);

  check(checkoutRes, {
    'checkout status 200/302': (r) => r.status === 200 || r.status === 302,
    'checkout has Woo content': (r) =>
      (r.status === 200 || r.status === 302) &&
      r.body &&
      (r.body.includes('woocommerce') || r.body.includes('checkout')),
  });

  const s = __ENV.SLEEP ? parseFloat(__ENV.SLEEP) : 0;
  if (s > 0) sleep(s);
}
