#!/usr/bin/env bash
set -euo pipefail
shopt -s extglob

# ──────────────────────────────────────────────────────────────────────
# tune_apache_env.sh  — Docker-aware Apache (event MPM) tuner
#   • Favors modest MRW (128–192) for small containers with ModSecurity
#   • Reads apache mem_limit/cpus from docker-compose.prod.yml (optional)
#   • Writes APACHE_* keys into .env (idempotent upsert)
# Usage:
#   ./tune_apache_env.sh                 # auto-detect host + compose
#   ./tune_apache_env.sh --dry-run
#   ./tune_apache_env.sh 4c 8G          # force host cores/RAM
#   ./tune_apache_env.sh --mrw 192      # force MaxRequestWorkers
#   ./tune_apache_env.sh --env .env.prod --compose docker-compose.prod.yml
# ──────────────────────────────────────────────────────────────────────

ENV_FILE=".env"
COMPOSE_FILE="docker-compose.prod.yml"
DRY_RUN=0
OVERRIDE_THREADS=""
OVERRIDE_MRW=""
CLI_CPUS=""
CLI_MEM_GIB=""
PROFILE="auto"  # auto | safe | burst

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [<N>c] [<M>G]
  -e, --env FILE            .env location (default .env)
  -f, --compose FILE        docker-compose file (default docker-compose.prod.yml)
      --dry-run             Show values, do not write
      --threads N           Override ThreadsPerChild
      --mrw N               Override MaxRequestWorkers (final cap)
      --cpus N              Override detected CPU cores
      --mem  N              Override detected Mem (GiB)
      --profile {auto|safe|burst}
Examples:
  $(basename "$0") 4c 8G
  $(basename "$0") --mrw 192 --threads 64
  $(basename "$0") --profile safe
EOF
  exit 1
}

# ---- flag parsing (no GNU getopt dependency) ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)        ENV_FILE="$2"; shift 2 ;;
    -f|--compose)    COMPOSE_FILE="$2"; shift 2 ;;
    --dry-run)       DRY_RUN=1; shift ;;
    --threads)       OVERRIDE_THREADS="$2"; shift 2 ;;
    --mrw)           OVERRIDE_MRW="$2"; shift 2 ;;
    --cpus)          CLI_CPUS="$2"; shift 2 ;;
    --mem)           CLI_MEM_GIB="$2"; shift 2 ;;
    --profile)       PROFILE="$2"; shift 2 ;;
    -h|--help)       usage ;;
    +([0-9])c|+([0-9])) CLI_CPUS="${1//[!0-9]/}"; shift ;;
    +([0-9])[gG])     CLI_MEM_GIB="${1//[!0-9]/}"; shift ;;
    *) echo "Unknown option '$1'"; usage ;;
  esac
done

# ─────────── helpers ───────────
clamp() { local v=$1 min=$2 max=$3; (( v<min )) && v=$min; (( v>max )) && v=$max; printf '%s' "$v"; }
ceil_div() { # ceil(a/b)
  local a=$1 b=$2; echo $(( (a + b - 1) / b ))
}
to_gib_from_bytes() { echo $(( $1 / 1024 / 1024 / 1024 )); }

parse_compose_apache_limits() {
  # Very light parser for mem_limit/cpus inside "services: apache:"
  # Accepts values like "1500m", "1g", "2G", or plain integers.
  local mem_raw="" cpus_raw=""
  [[ -f "$COMPOSE_FILE" ]] || return 0

  # Extract the apache service block then grep values
  local block
  block="$(awk '
    $0 ~ /^[[:space:]]*apache:/ {inblk=1}
    inblk && $0 ~ /^[[:space:]]*[a-zA-Z0-9_-]+:/ && $0 !~ /^[[:space:]]*(apache|build):/ && NR>1 && prev_blank==1 {inblk=0}
    inblk {print}
    {prev_blank = ($0 ~ /^[[:space:]]*$/)}
  ' "$COMPOSE_FILE" 2>/dev/null || true)"

  mem_raw="$(printf "%s\n" "$block" | awk -F: '/mem_limit:/ {gsub(/[[:space:]]/,"",$2); print $2; exit}' || true)"
  cpus_raw="$(printf "%s\n" "$block" | awk -F: '/cpus:/ {gsub(/[[:space:]]/,"",$2); print $2; exit}' || true)"

  # Normalize mem_raw → GiB integer
  if [[ -n "$mem_raw" ]]; then
    case "$mem_raw" in
      *[gG]) mem_gib_comp="${mem_raw%[gG]}" ;;
      *[mM]) # convert MiB-ish like "1500m" → GiB (ceil)
             local m="${mem_raw%[mM]}"; mem_gib_comp=$(( (m + 1023) / 1024 )) ;;
      *[kK]) local k="${mem_raw%[kK]}"; mem_gib_comp=$(( (k + 1048575) / 1048576 )) ;;
      *.*)   # decimal like "1.5"
             mem_gib_comp=$(awk -v v="$mem_raw" 'BEGIN{printf "%d", (v==int(v)?v:v+0.999)}') ;;
      *)     mem_gib_comp="$mem_raw" ;;
    esac
  fi

  # cpus_raw can be fractional; keep one decimal (we only need floor later)
  if [[ -n "$cpus_raw" ]]; then
    cpu_comp="$(printf "%s" "$cpus_raw" | awk '{printf "%.1f",$0}' 2>/dev/null || true)"
  fi

  # Export to globals if set
  [[ -n "${mem_gib_comp:-}" ]] && COMPOSE_MEM_GIB="$mem_gib_comp" || COMPOSE_MEM_GIB=""
  [[ -n "${cpu_comp:-}"     ]] && COMPOSE_CPUS="$cpu_comp"       || COMPOSE_CPUS=""
}

# ─────────── Host resources (fallbacks) ───────────
cpu_count_host="${CLI_CPUS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu || echo 2)}"
if [[ -n "$CLI_MEM_GIB" ]]; then
  mem_gib_host="$CLI_MEM_GIB"
else
  mem_bytes=$(awk '/MemTotal/ {print $2*1024}' /proc/meminfo 2>/dev/null || sysctl -n hw.memsize || echo 2147483648)
  mem_gib_host="$(to_gib_from_bytes "$mem_bytes")"
fi

# ─── Try to read apache container limits from compose ───
COMPOSE_MEM_GIB=""; COMPOSE_CPUS=""
parse_compose_apache_limits

# Prefer compose (container) limits if present
mem_gib="${COMPOSE_MEM_GIB:-$mem_gib_host}"
cpu_count="${COMPOSE_CPUS:-$cpu_count_host}"
# Round down fractional CPUs for child count decisions (min 1)
cpu_int="$(printf "%s\n" "$cpu_count" | awk -F. '{print ($1<1)?1:$1}')"

# ─────────── Heuristics tailored for small containers ───────────
# Default threads per child: 64 (event MPM stock), overridable
threads_per_child=64
[[ -n "$OVERRIDE_THREADS" ]] && threads_per_child="$OVERRIDE_THREADS"

# Target MaxRequestWorkers:
#  ≤2 GiB → 128, ≤3 GiB → 192, ≤4 GiB → 256, else modest ramp
choose_target_mrw() {
  local gib="$1"
  if [[ -n "$OVERRIDE_MRW" ]]; then echo "$OVERRIDE_MRW"; return; fi
  case "$gib" in
    ''|0|1|2)     echo 128 ;;
    3)            echo 192 ;;
    4)            echo 256 ;;
    5|6)          echo 288 ;;
    7|8)          echo 320 ;;
    *)            echo 384 ;;  # still conservative
  esac
}

# Profile nudges:
#  safe  → bias down one step; burst → bias up one step (cap later)
adjust_for_profile() {
  local mrw="$1"
  case "$PROFILE" in
    safe)  echo $(( mrw - (mrw>=192 ? 64 : 32) )) ;;
    burst) echo $(( mrw + 64 )) ;;
    *)     echo "$mrw" ;;
  esac
}

target_mrw="$(choose_target_mrw "$mem_gib")"
target_mrw="$(adjust_for_profile "$target_mrw")"
(( target_mrw < 64 )) && target_mrw=64

# Derive ServerLimit from MRW and ThreadsPerChild
server_limit="$(ceil_div "$target_mrw" "$threads_per_child")"
server_limit="$(clamp "$server_limit" 1 32)"

# Ensure MRW does not exceed derived capacity (SL * TPC)
max_workers=$(( server_limit * threads_per_child ))
if (( max_workers > target_mrw )); then
  # We keep the *capacity* (max_workers), Apache will allow up to this.
  # If user forced MRW lower, they should also lower SL/TPC. Our goal is safe.
  :
else
  # If capacity < desired target, capacity wins.
  target_mrw="$max_workers"
fi

# StartServers: small warm pool, cap to min(server_limit, cpu_int, 4)
start_servers="$(clamp "$cpu_int" 1 4)"
(( start_servers > server_limit )) && start_servers="$server_limit"

# Spare threads: keep modest to avoid thrash (≈ 1/8 and 1/2 of MRW), but within [8, MRW-16]
spare_min=$(( target_mrw / 8 ))
spare_max=$(( target_mrw / 2 ))
(( spare_min < 8 )) && spare_min=8
(( spare_max < spare_min )) && spare_max=$(( spare_min * 2 ))
(( spare_max > target_mrw )) && spare_max=$target_mrw

# Final safety clamps
threads_per_child="$(clamp "$threads_per_child" 32 256)"
server_limit="$(clamp "$server_limit" 1 32)"
max_workers=$(( server_limit * threads_per_child ))
(( target_mrw > max_workers )) && target_mrw="$max_workers"
(( spare_min > target_mrw )) && spare_min=$(( target_mrw / 4 ))
(( spare_max > target_mrw )) && spare_max=$target_mrw

# ─────────── Upsert helper ───────────
upsert() {
  local k=$1 v=$2
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i'' -e "s/^${k}=.*/${k}=${v}/" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
  printf "%-22s %s\n" "$k" "$v"
}

# ─────────── Persist / preview ────────
touch "$ENV_FILE"

echo "Detected (preference: compose → host):"
printf "  CPUs: %s (int=%s)   RAM GiB: %s\n" "$cpu_count" "$cpu_int" "$mem_gib"
[[ -f "$COMPOSE_FILE" ]] && echo "  compose: $COMPOSE_FILE"

echo
echo "Proposed Apache event MPM:"
printf "  ThreadsPerChild       %s\n" "$threads_per_child"
printf "  ServerLimit           %s\n" "$server_limit"
printf "  MaxRequestWorkers     %s (capacity=%s)\n" "$target_mrw" "$max_workers"
printf "  StartServers          %s\n" "$start_servers"
printf "  SpareMin              %s\n" "$spare_min"
printf "  SpareMax              %s\n" "$spare_max"
echo

if (( DRY_RUN )); then
  echo "# Dry-run – values not written to $ENV_FILE"
  exit 0
fi

upsert APACHE_THREADS        "$threads_per_child"
upsert APACHE_SERVER_LIMIT   "$server_limit"
upsert APACHE_MAX_WORKERS    "$target_mrw"
upsert APACHE_START_SERVERS  "$start_servers"
upsert APACHE_SPARE_MIN      "$spare_min"
upsert APACHE_SPARE_MAX      "$spare_max"
