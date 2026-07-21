# Benchmark validation harness

Validates the numbers published at [deploypete.com/benchmarks](https://deploypete.com/benchmarks/)
with code instead of estimates. [claims.json](claims.json) encodes the published claims per
server tier; two k6 scripts measure them; [compare.py](compare.py) prints a claimed-vs-measured
table and exits non-zero when a claim isn't supported.

## Requirements

```bash
brew install k6        # load generator
```

Python 3 (macOS default is fine) for the claims parsing and report.

## One-command run

```bash
./run.sh <tier> <base_url> [low|high]

# examples
./run.sh 8ram-4cpu  https://staging2.saveaplaya.org high
PRODUCT_ID=29087 CHECKOUT_PATH=/checkout-2/ ./run.sh 8ram-4cpu https://staging2.saveaplaya.org
```

Tiers map to the repo's compose profiles: `8ram-4cpu`, `16ram-4cpu`, `32ram-8cpu`
(`16ram-6cpu` has no published claim, so it isn't in claims.json). `low|high` picks
which end of the claimed visits range to validate (default `high`; e.g. the 8 GB tier's
216M–432M/month becomes 83 vs 167 req/s).

What it runs:

1. **cached-visits.js** — hits cached pages at the request rate implied by the
   claimed monthly visits (`visits / 2,592,000s`), with k6 thresholds on error
   rate (<1%), average and p95 response time taken from the tier's claimed page-load range.
2. **checkout-flow.js** — completes **real orders** at the claimed checkouts/min:
   add to cart → load checkout → extract nonce → `?wc-ajax=checkout` with the
   COD gateway. Threshold: ≥95% of attempts must become orders.
3. **compare.py** — claimed vs measured table, `PASS`/`FAIL` per metric, exit code.

Results land in `results/<tier>-{cached,checkout}.json` (k6 `--summary-export`).

## Target-site prerequisites (checkout test)

Run against a **throwaway playground or staging clone, never production** — it
creates real orders in the database.

- Cash-on-Delivery gateway enabled (or pass `PAYMENT_METHOD`)
- Guest checkout allowed
- `CHECKOUT_PATH` must be the classic `[woocommerce_checkout]` shortcode page
  (the block checkout doesn't submit via `?wc-ajax=checkout`)

Verify the order count afterward inside the playground:

```bash
docker compose exec php bash
wp wc shop_order list --status=processing --user=admin | wc -l
```

Clean up test orders: `wp post delete $(wp post list --post_type=shop_order --format=ids) --force`
(playground only!).

## Useful knobs (env vars)

| Var | Default | Meaning |
|---|---|---|
| `CACHED_DURATION` / `CHECKOUT_DURATION` | `2m` / `5m` | test lengths |
| `PATHS` | `/` | comma-separated cached paths to rotate through |
| `PRODUCT_ID` / `CHECKOUT_PATH` | `1` / `/checkout/` | Woo product + checkout page |
| `PLACE_ORDER=0` | place orders | checkout test degrades to page-views only |
| `SKIP_CACHED=1` / `SKIP_CHECKOUT=1` | run both | run one test only |

Breaking-point mode (find the real ceiling instead of validating a fixed rate):

```bash
k6 run cached-visits.js -e BASE_URL=https://site -e MODE=ramp -e MAX_RATE=500 -e DURATION=5m
```

## Methodology caveats (for honest published numbers)

- **Generate load from a separate machine.** Running k6 on the same host as the
  Docker stack steals CPU from Apache/PHP and understates the numbers.
- k6 measures **server response time** of the HTML document, not browser-rendered
  page load; the claimed "average page load" is used as the response-time budget,
  which is the stricter reading.
- "Monthly visits" assumes the claimed rate sustained 24/7 for 30 days
  (432M/month ≈ 167 req/s). Real traffic peaks; validating the high bound as a
  *sustained* rate is therefore conservative.
- The legacy root-level [woo-checkout-flow.js](../woo-checkout-flow.js) is the
  original page-view-only script; [checkout-flow.js](checkout-flow.js) supersedes
  it for claim validation because it completes real orders.
