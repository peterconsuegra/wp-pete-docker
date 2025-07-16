#!/usr/bin/env bash
# bin/tune_apache_env.sh
# ---------------------------------------------------------
# Auto-tune Apache 2.4 *event* MPM for the host it runs on exmaple777:
#   • Detect CPU-cores & RAM
#   • Derive sensible MPM numbers
#   • Upsert them into the chosen .env file
# ---------------------------------------------------------
set -euo pipefail
shopt -s extglob               # for pattern matching in case/esac

# ─────────────── CLI ────────────────
ENV_FILE=".env"
DRY_RUN=0
OVERRIDE_THREADS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)     ENV_FILE="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=1; shift ;;
    --threads)    OVERRIDE_THREADS="$2"; shift 2 ;;
    *) echo "Unknown option $1"; exit 1 ;;
  esac
done

# ─────────── 0) Host resources ───────────
cpu_count=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)
mem_bytes=$(awk '/MemTotal/ {print $2*1024}' /proc/meminfo 2>/dev/null || \
            sysctl -n hw.memsize)
mem_gib=$(( mem_bytes / 1024 / 1024 / 1024 ))   # GiB, rounded down

# ─────────── 1) Heuristics ───────────────
clamp () { local v=$1 min=$2 max=$3; (( v<min )) && v=$min; (( v>max )) && v=$max; printf '%s' "$v"; }

# ThreadsPerChild – ramp up with RAM, cap at 512
case "$mem_gib" in
  [0-3])                  threads_per_child=32  ;;
  [4-7])                  threads_per_child=64  ;;
  8|9|1[0-5])             threads_per_child=128 ;;
  1[6-9]|2[0-9])          threads_per_child=256 ;;
  *)                      threads_per_child=512 ;;
esac
[[ -n "$OVERRIDE_THREADS" ]] && threads_per_child="$OVERRIDE_THREADS"

# StartServers – 1 child per core, but keep it sane
start_servers=$(clamp "$cpu_count" 2 32)

# ServerLimit – we allow 2× cores, min 16, max 256 (typical build limit)
server_limit=$(clamp $(( cpu_count*2 )) 16 256)

# MaxRequestWorkers – ServerLimit × ThreadsPerChild
max_workers=$(( server_limit * threads_per_child ))

# Spare threads
spare_min=$threads_per_child
spare_max=$(( threads_per_child * 3 ))

# ─────────── 2) .env helper ──────────────
upsert () {
  local k=$1 v=$2
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i'' -e "s/^${k}=.*/${k}=${v}/" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
  printf "%-20s %s\n" "$k" "$v"
}

# ─────────── 3) Persist / preview ────────
touch "$ENV_FILE"
if (( DRY_RUN )); then
  echo "# Dry-run – nothing written to $ENV_FILE"
else
  upsert APACHE_THREADS        "$threads_per_child"
  upsert APACHE_SERVER_LIMIT   "$server_limit"
  upsert APACHE_MAX_WORKERS    "$max_workers"
  upsert APACHE_START_SERVERS  "$start_servers"
  upsert APACHE_SPARE_MIN      "$spare_min"
  upsert APACHE_SPARE_MAX      "$spare_max"
fi
