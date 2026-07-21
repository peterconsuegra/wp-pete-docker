#!/usr/bin/env bash
# Validate the published benchmark claims for one server tier against a live site.
#
#   ./run.sh <tier> <base_url> [low|high]
#   ./run.sh 8ram-4cpu https://staging2.saveaplaya.org high
#
# tier      one of the keys in claims.json (8ram-4cpu, 16ram-4cpu, 32ram-8cpu)
# base_url  the site to hit (playground or staging clone — never production)
# bound     which end of the claimed visits range to validate (default: high)
#
# Extra knobs via env: PRODUCT_ID, CHECKOUT_PATH, PATHS, CACHED_DURATION,
# CHECKOUT_DURATION, PLACE_ORDER (0 to skip real orders), SKIP_CACHED,
# SKIP_CHECKOUT.
set -euo pipefail

cd "$(dirname "$0")"

TIER="${1:?usage: run.sh <tier> <base_url> [low|high]}"
BASE_URL="${2:?usage: run.sh <tier> <base_url> [low|high]}"
BOUND="${3:-high}"

command -v k6 >/dev/null || { echo "k6 not found — install with: brew install k6" >&2; exit 1; }

# Derive per-tier targets from claims.json
eval "$(python3 - "$TIER" "$BOUND" <<'PY'
import json, sys
tier, bound = sys.argv[1], sys.argv[2]
claims = json.load(open("claims.json"))["tiers"]
if tier not in claims:
    sys.exit(f"unknown tier '{tier}' — known: {', '.join(claims)}")
c = claims[tier]
idx = 0 if bound == "low" else 1
visits = c["cached_visits_month"][idx]
rate = round(visits / 2_592_000)           # visits/month -> req/s (30 days)
avg_ms = int(c["avg_page_load_s"][1] * 1000)
p95_ms = avg_ms * 2
print(f"RATE={rate}")
print(f"AVG_MS={avg_ms}")
print(f"P95_MS={p95_ms}")
print(f"CHECKOUTS_PER_MIN={c['checkouts_per_min']}")
PY
)"

CACHED_DURATION="${CACHED_DURATION:-2m}"
CHECKOUT_DURATION="${CHECKOUT_DURATION:-5m}"
RESULTS_DIR="results"
mkdir -p "$RESULTS_DIR"

echo "== Tier $TIER ($BOUND bound) against $BASE_URL"
echo "   cached target: ${RATE} req/s for ${CACHED_DURATION} (avg<${AVG_MS}ms, p95<${P95_MS}ms)"
echo "   checkout target: ${CHECKOUTS_PER_MIN}/min for ${CHECKOUT_DURATION}"

CACHED_JSON="$RESULTS_DIR/${TIER}-cached.json"
CHECKOUT_JSON="$RESULTS_DIR/${TIER}-checkout.json"

# k6 exits non-zero when thresholds fail; don't abort — compare.py renders
# the final claimed-vs-measured verdict from the exported summaries.
if [[ "${SKIP_CACHED:-0}" != "1" ]]; then
  k6 run cached-visits.js \
    -e BASE_URL="$BASE_URL" \
    -e RATE="$RATE" \
    -e DURATION="$CACHED_DURATION" \
    -e AVG_MS="$AVG_MS" \
    -e P95_MS="$P95_MS" \
    ${PATHS:+-e PATHS="$PATHS"} \
    --summary-export "$CACHED_JSON" || true
fi

if [[ "${SKIP_CHECKOUT:-0}" != "1" ]]; then
  k6 run checkout-flow.js \
    -e BASE_URL="$BASE_URL" \
    -e RATE_PER_MIN="$CHECKOUTS_PER_MIN" \
    -e DURATION="$CHECKOUT_DURATION" \
    -e PLACE_ORDER="${PLACE_ORDER:-1}" \
    ${PRODUCT_ID:+-e PRODUCT_ID="$PRODUCT_ID"} \
    ${CHECKOUT_PATH:+-e CHECKOUT_PATH="$CHECKOUT_PATH"} \
    --summary-export "$CHECKOUT_JSON" || true
fi

echo
python3 compare.py \
  --tier "$TIER" \
  --bound "$BOUND" \
  ${SKIP_CACHED:+--no-cached} \
  ${SKIP_CHECKOUT:+--no-checkout} \
  --cached-json "$CACHED_JSON" \
  --checkout-json "$CHECKOUT_JSON" \
  --cached-duration "$CACHED_DURATION" \
  --checkout-duration "$CHECKOUT_DURATION"
