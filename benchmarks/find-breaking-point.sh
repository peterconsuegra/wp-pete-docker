#!/usr/bin/env bash
# Find the real checkout ceiling of a Pete Panel server by stepping the arrival
# rate and watching where latency and success rate break down.
#
#   ./find-breaking-point.sh <base_url> [ssh_host] [rates...]
#   ./find-breaking-point.sh https://staging.deploypete.com root@staging.deploypete.com 50 100 200 400 800
#
# Each step runs checkout-flow.js at a fixed orders/min for STEP_DURATION, then
# cools down. Server-side CPU and PHP-FPM worker counts are sampled mid-step, so
# a degraded step can be attributed (CPU-bound vs worker-starved vs DB).
#
# Requires: outbound mail disabled on the target (see the k6 mu-plugin), else
# every order hits the real mail provider.
set -uo pipefail
cd "$(dirname "$0")"

BASE_URL="${1:?usage: find-breaking-point.sh <base_url> [ssh_host] [rates...]}"
SSH_HOST="${2:-}"
shift 2 2>/dev/null || shift 1
RATES=("${@:-50 100 200 400 800}")
[[ ${#RATES[@]} -eq 1 ]] && read -ra RATES <<< "${RATES[0]}"

STEP_DURATION="${STEP_DURATION:-2m}"
COOLDOWN="${COOLDOWN:-30}"
SSH_OPTS="-p ${SSH_PORT:-22}"
OUT="results/breaking-point"
mkdir -p "$OUT"

PHP_C=pete-panel-php-1
DB_C=pete-panel-db-1

echo "== Breaking-point sweep against $BASE_URL"
echo "   rates: ${RATES[*]} orders/min | ${STEP_DURATION} per step | ${COOLDOWN}s cooldown"
echo

for RATE in "${RATES[@]}"; do
  TAG="bp${RATE}$(date +%H%M%S)"
  echo "--- ${RATE} orders/min  ($(date +%H:%M:%S))"

  # Sample the server mid-step, in the background.
  if [[ -n "$SSH_HOST" ]]; then
    (
      sleep 55
      ssh $SSH_OPTS "$SSH_HOST" "
        docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemPerc}}' $PHP_C $DB_C 2>/dev/null
        echo -n 'fpm_busy_workers='
        docker exec $PHP_C sh -c \"ps ax | grep -c 'pool www'\" 2>/dev/null
        echo -n 'load='; cat /proc/loadavg
      " > "$OUT/server-${RATE}.txt" 2>&1
    ) &
    MON_PID=$!
  fi

  k6 run checkout-flow.js \
    -e BASE_URL="$BASE_URL" \
    -e CART_MODE=plan_form \
    -e PLAN_VALUE=pro_plan \
    -e PAYMENT_METHOD=paypal \
    -e CREATE_ACCOUNT=1 \
    -e RUN_TAG="$TAG" \
    -e RATE_PER_MIN="$RATE" \
    -e DURATION="$STEP_DURATION" \
    -e PRE_VUS="${PRE_VUS:-60}" \
    -e MAX_VUS="${MAX_VUS:-400}" \
    -e DEBUG_LINES=3 \
    --summary-export "$OUT/rate-${RATE}.json" \
    --no-usage-report >/dev/null 2>&1 || true

  [[ -n "$SSH_HOST" ]] && wait $MON_PID 2>/dev/null
  echo "    done; cooling down ${COOLDOWN}s"
  sleep "$COOLDOWN"
done

echo
python3 analyze-breaking-point.py "$OUT" "$STEP_DURATION"
