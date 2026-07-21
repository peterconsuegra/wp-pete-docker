import http from 'k6/http';
import { check } from 'k6';

// Validates the "cached monthly visits" claim as a sustained request rate.
// 432M visits/month / 2,592,000 s = ~167 req/s. The runner (run.sh) derives
// RATE from claims.json; you can also invoke this script directly:
//
//   k6 run cached-visits.js -e BASE_URL=https://site -e RATE=167 -e DURATION=2m
//
// MODE=ramp finds the breaking point instead of validating a fixed rate:
// ramps arrival rate 0 -> MAX_RATE over DURATION, then holds for HOLD.

const BASE = __ENV.BASE_URL || 'http://pete.petelocal.net';
const PATHS = (__ENV.PATHS || '/').split(',');
// METHOD=HEAD runs a bandwidth-free request-rate test — useful when the load
// generator's own connection can't carry full page bodies at the target rate.
const METHOD = (__ENV.METHOD || 'GET').toUpperCase();
const RATE = __ENV.RATE ? parseInt(__ENV.RATE, 10) : 50;
const MAX_RATE = __ENV.MAX_RATE ? parseInt(__ENV.MAX_RATE, 10) : RATE * 3;
const DURATION = __ENV.DURATION || '2m';
const HOLD = __ENV.HOLD || '1m';

// Pass/fail thresholds, defaulted from the tier's claims by run.sh
const ERR_RATE = __ENV.ERR_RATE || '0.01';
const AVG_MS = __ENV.AVG_MS || '500';
const P95_MS = __ENV.P95_MS || '1000';

const peak = __ENV.MODE === 'ramp' ? MAX_RATE : RATE;

const scenarios =
  __ENV.MODE === 'ramp'
    ? {
        cached_ramp: {
          executor: 'ramping-arrival-rate',
          startRate: 0,
          timeUnit: '1s',
          preAllocatedVUs: Math.min(peak, 500),
          maxVUs: Math.min(peak * 2, 1000),
          stages: [
            { target: MAX_RATE, duration: DURATION },
            { target: MAX_RATE, duration: HOLD },
          ],
        },
      }
    : {
        cached_constant: {
          executor: 'constant-arrival-rate',
          rate: RATE,
          timeUnit: '1s',
          duration: DURATION,
          preAllocatedVUs: Math.min(peak, 500),
          maxVUs: Math.min(peak * 2, 1000),
          gracefulStop: '30s',
        },
      };

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: [`rate<${ERR_RATE}`],
    http_req_duration: [`avg<${AVG_MS}`, `p(95)<${P95_MS}`],
  },
};

export default function () {
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  // Fresh jar per iteration: a stored WP/Woo session cookie would make
  // subsequent requests bypass the page cache and skew the numbers.
  const params = {
    jar: new http.CookieJar(),
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    tags: { name: `page:cached:${METHOD.toLowerCase()}` },
    timeout: __ENV.TIMEOUT || '30s',
  };
  if (METHOD !== 'HEAD') {
    // Browsers always request compression; without this the test measures
    // uncompressed transfer (~4x the bandwidth) and bottlenecks the client.
    // (Not on HEAD: k6 errors decompressing the empty body.)
    params.headers['Accept-Encoding'] = 'gzip, deflate, br';
  }

  const res = http.request(METHOD, `${BASE}${path}`, null, params);

  check(res, {
    'status 200': (r) => r.status === 200,
    'looks like a rendered page': (r) =>
      r.status === 200 &&
      (METHOD === 'HEAD' || (r.body && r.body.includes('</html'))),
  });
}
