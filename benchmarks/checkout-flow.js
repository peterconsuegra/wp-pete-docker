import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// Validates the "WooCommerce checkouts per minute" claim by completing real
// orders: add to cart -> load checkout (grab nonce) -> POST ?wc-ajax=checkout
// with the Cash-on-Delivery gateway.
//
//   k6 run checkout-flow.js -e BASE_URL=https://site -e PRODUCT_ID=123 \
//     -e RATE_PER_MIN=20 -e DURATION=5m
//
// Target-site prerequisites (throwaway playground site, never production):
//   - COD payment gateway enabled (or set PAYMENT_METHOD)
//   - guest checkout allowed, no required terms checkbox beyond "terms=on"
//   - CHECKOUT_PATH pointing at the classic [woocommerce_checkout] page
//     (the block-based checkout does not submit via ?wc-ajax=checkout)
// Verify afterward inside the playground:
//   wp wc shop_order list --status=processing --user=admin
//
// PLACE_ORDER=0 reverts to the old behavior (add to cart + GET checkout only).

const checkoutsCompleted = new Counter('checkouts_completed');
const checkoutsFailed = new Counter('checkouts_failed');
const nonceMissing = new Counter('nonce_missing');

const BASE = __ENV.BASE_URL || 'http://pete.petelocal.net';
const PRODUCT_ID = __ENV.PRODUCT_ID || '1';
const QTY = __ENV.QTY || '1';
const CHECKOUT_PATH = __ENV.CHECKOUT_PATH || '/checkout/';
const PAYMENT_METHOD = __ENV.PAYMENT_METHOD || 'cod';
const PLACE_ORDER = __ENV.PLACE_ORDER !== '0';
// CART_MODE=plan_form posts PLAN_FIELD=PLAN_VALUE to PLAN_PATH instead of
// wc-ajax add_to_cart (deploypete.com pricing-page flow: plan=pro_plan
// -> 303 -> /checkout/).
const CART_MODE = __ENV.CART_MODE || 'add_to_cart';
const PLAN_PATH = __ENV.PLAN_PATH || '/pricing/';
const PLAN_FIELD = __ENV.PLAN_FIELD || 'plan';
const PLAN_VALUE = __ENV.PLAN_VALUE || 'pro_plan';
// CREATE_ACCOUNT=1 registers a throwaway customer per order (required when
// the store forces registration, e.g. subscription products). RUN_TAG salts
// emails so repeated runs don't collide with already-registered addresses.
const CREATE_ACCOUNT = __ENV.CREATE_ACCOUNT === '1';
const RUN_TAG = __ENV.RUN_TAG || 'run0';
const RATE_PER_MIN = __ENV.RATE_PER_MIN ? parseInt(__ENV.RATE_PER_MIN, 10) : 20;
const DURATION = __ENV.DURATION || '5m';
const TIMEOUT = __ENV.TIMEOUT || '30s';

const MAX_DEBUG_LINES = __ENV.DEBUG_LINES ? parseInt(__ENV.DEBUG_LINES, 10) : 20;
let debugLines = 0;

function debug(msg) {
  if (debugLines < MAX_DEBUG_LINES) {
    debugLines += 1;
    console.warn(msg);
  }
}

export const options = {
  scenarios: {
    checkout_flow: {
      executor: 'constant-arrival-rate',
      rate: RATE_PER_MIN,
      timeUnit: '1m',
      duration: DURATION,
      preAllocatedVUs: __ENV.PRE_VUS ? parseInt(__ENV.PRE_VUS, 10) : 30,
      maxVUs: __ENV.MAX_VUS ? parseInt(__ENV.MAX_VUS, 10) : 120,
      gracefulStop: '60s',
    },
  },
  thresholds: Object.assign(
    { http_req_failed: [`rate<${__ENV.ERR_RATE || '0.01'}`] },
    PLACE_ORDER
      ? {
          // At least 95% of attempted iterations must complete an order.
          checkouts_completed: [
            `count>=${Math.ceil(RATE_PER_MIN * durationMinutes(DURATION) * 0.95)}`,
          ],
        }
      : {}
  ),
};

function durationMinutes(d) {
  const m = String(d).match(/^(\d+(?:\.\d+)?)(s|m|h)$/);
  if (!m) return 5;
  const n = parseFloat(m[1]);
  return m[2] === 's' ? n / 60 : m[2] === 'h' ? n * 60 : n;
}

export default function () {
  // Each iteration is one shopper: own cookie jar -> own Woo session.
  const jar = new http.CookieJar();

  // 1) Put the product in the cart
  let addOk;
  if (CART_MODE === 'plan_form') {
    const addRes = http.post(
      `${BASE}${PLAN_PATH}`,
      `${encodeURIComponent(PLAN_FIELD)}=${encodeURIComponent(PLAN_VALUE)}`,
      {
        jar,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        redirects: 0,
        tags: { name: 'plan-form' },
        timeout: TIMEOUT,
      }
    );
    addOk = check(addRes, {
      'plan form redirected to checkout': (r) =>
        (r.status === 302 || r.status === 303) &&
        String(r.headers['Location'] || '').includes('checkout'),
    });
    if (!addOk) debug(`[plan] status=${addRes.status} url=${addRes.url}`);
  } else {
    const addRes = http.post(
      `${BASE}/?wc-ajax=add_to_cart`,
      `product_id=${encodeURIComponent(PRODUCT_ID)}&quantity=${encodeURIComponent(QTY)}`,
      {
        jar,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
        },
        redirects: 0,
        tags: { name: 'wc-ajax:add_to_cart' },
        timeout: TIMEOUT,
      }
    );
    addOk = check(addRes, {
      'add_to_cart status 200': (r) => r.status === 200,
      'add_to_cart returned fragments/cart': (r) => {
        if (r.status !== 200) return false;
        try {
          const j = r.json();
          return !!(j && (j.fragments || j.cart_hash || j.cart_key));
        } catch (e) {
          return false;
        }
      },
    });
    if (!addOk) {
      debug(`[add] status=${addRes.status} err=${addRes.error || 'none'} url=${addRes.url}`);
    }
  }
  if (!addOk) {
    checkoutsFailed.add(1);
    return;
  }

  // 2) Load checkout page (renders the form + fresh nonce for this session)
  const pageRes = http.get(`${BASE}${CHECKOUT_PATH}`, {
    jar,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    tags: { name: 'page:checkout' },
    timeout: TIMEOUT,
  });

  const pageOk = check(pageRes, {
    'checkout page status 200': (r) => r.status === 200,
    'checkout page has Woo form': (r) =>
      r.status === 200 && r.body && r.body.includes('woocommerce'),
  });
  if (!pageOk) {
    debug(`[checkout-page] status=${pageRes.status} url=${pageRes.url}`);
    checkoutsFailed.add(1);
    return;
  }

  if (!PLACE_ORDER) return;

  const nonceMatch = pageRes.body.match(
    /name="woocommerce-process-checkout-nonce"\s+value="([^"]+)"/
  );
  if (!nonceMatch) {
    nonceMissing.add(1);
    checkoutsFailed.add(1);
    debug(
      '[checkout-page] no woocommerce-process-checkout-nonce found — ' +
        'is this the classic [woocommerce_checkout] shortcode page?'
    );
    return;
  }

  // 3) Place the order
  const fields = {
    billing_first_name: 'Bench',
    billing_last_name: `Bot-${__VU}-${__ITER}`,
    billing_company: '',
    billing_country: __ENV.BILLING_COUNTRY || 'US',
    billing_address_1: '1 Benchmark Way',
    billing_address_2: '',
    billing_city: 'Miami',
    billing_state: __ENV.BILLING_STATE || 'FL',
    billing_postcode: __ENV.BILLING_POSTCODE || '33101',
    billing_phone: '5550100',
    billing_email: `bench+${RUN_TAG}-${__VU}-${__ITER}@example.com`,
    order_comments: '',
    payment_method: PAYMENT_METHOD,
    terms: 'on',
    'terms-field': '1',
    'woocommerce-process-checkout-nonce': nonceMatch[1],
    _wp_http_referer: `${CHECKOUT_PATH}?wc-ajax=update_order_review`,
  };
  if (CREATE_ACCOUNT) {
    fields.createaccount = '1';
    fields.account_password = `K6bench!${RUN_TAG}-${__VU}-${__ITER}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const orderRes = http.post(
    `${BASE}/?wc-ajax=checkout`,
    fields,
    {
      jar,
      headers: { Accept: 'application/json, text/plain, */*' },
      redirects: 0,
      tags: { name: 'wc-ajax:checkout' },
      timeout: TIMEOUT,
    }
  );

  let result = null;
  try {
    result = orderRes.json();
  } catch (e) {
    /* non-JSON response falls through as failure */
  }

  const placed = check(orderRes, {
    'order placed (result=success)': () =>
      !!(result && result.result === 'success'),
  });

  if (placed) {
    checkoutsCompleted.add(1);
  } else {
    checkoutsFailed.add(1);
    const detail = result
      ? `result=${result.result} messages=${String(result.messages || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 200)}`
      : `status=${orderRes.status} body=${String(orderRes.body || '').slice(0, 200)}`;
    debug(`[order] failed: ${detail}`);
  }

  const s = __ENV.SLEEP ? parseFloat(__ENV.SLEEP) : 0;
  if (s > 0) sleep(s);
}
