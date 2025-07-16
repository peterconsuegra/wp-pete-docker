#!/usr/bin/env bash
set -euo pipefail
shopt -s extglob             # enables pattern matching

# ───────────── CLI flags ─────────────
ENV_FILE=".env"
DRY_RUN=0
OVERRIDE_THREADS=""
CLI_CPUS=""
CLI_MEM_GIB=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [<N>c] [<M>G]
  -e, --env FILE        .env location (default .env)
      --dry-run         Show values, do not write
      --threads N       Override ThreadsPerChild
      --cpus   N        Override detected CPU cores
      --mem    N        Override detected Mem (GiB)
Examples:
  $(basename "$0") 4c 8G           # 4 cores, 8 GiB RAM
  $(basename "$0") --dry-run --threads 128
EOF
  exit 1
}

# ---- flag parsing (GNU & BSD getopt-free) ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)        ENV_FILE="$2"; shift 2 ;;
    --dry-run)       DRY_RUN=1; shift ;;
    --threads)       OVERRIDE_THREADS="$2"; shift 2 ;;
    --cpus)          CLI_CPUS="$2"; shift 2 ;;
    --mem)           CLI_MEM_GIB="$2"; shift 2 ;;
    -h|--help)       usage ;;
    # positional overrides like 4c or 8G
    +([0-9])c|+([0-9])) CLI_CPUS="${1//[!0-9]/}"; shift ;;
    +([0-9])[gG])     CLI_MEM_GIB="${1//[!0-9]/}"; shift ;;
    *) echo "Unknown option '$1'"; usage ;;
  esac
done

# ─────────── Host resources ───────────
cpu_count="${CLI_CPUS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)}"

if [[ -n "$CLI_MEM_GIB" ]]; then
  mem_gib="$CLI_MEM_GIB"
else
  mem_bytes=$(awk '/MemTotal/ {print $2*1024}' /proc/meminfo 2>/dev/null || sysctl -n hw.memsize)
  mem_gib=$(( mem_bytes / 1024 / 1024 / 1024 ))
fi

# ─────────── Heuristics (unchanged) ────
clamp() { local v=$1 min=$2 max=$3; (( v<min )) && v=$min; (( v>max )) && v=$max; printf '%s' "$v"; }

case "$mem_gib" in
  [0-3])                  threads_per_child=32  ;;
  [4-7])                  threads_per_child=64  ;;
  8|9|1[0-5])             threads_per_child=128 ;;
  1[6-9]|2[0-9])          threads_per_child=256 ;;
  *)                      threads_per_child=512 ;;
esac
[[ -n "$OVERRIDE_THREADS" ]] && threads_per_child="$OVERRIDE_THREADS"

start_servers=$(clamp "$cpu_count" 2 32)
server_limit=$(clamp $(( cpu_count*2 )) 16 256)
max_workers=$(( server_limit * threads_per_child ))
spare_min=$threads_per_child
spare_max=$(( threads_per_child * 3 ))

# ─────────── Upsert helper ────────────
upsert() {
  local k=$1 v=$2
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i'' -e "s/^${k}=.*/${k}=${v}/" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
  printf "%-19s %s\n" "$k" "$v"
}

# ─────────── Persist / preview ────────
touch "$ENV_FILE"
echo "Detected: ${cpu_count} CPU, ${mem_gib} GiB RAM"
if (( DRY_RUN )); then
  echo "# Dry-run – values not written to $ENV_FILE"; exit 0
fi

upsert APACHE_THREADS        "$threads_per_child"
upsert APACHE_SERVER_LIMIT   "$server_limit"
upsert APACHE_MAX_WORKERS    "$max_workers"
upsert APACHE_START_SERVERS  "$start_servers"
upsert APACHE_SPARE_MIN      "$spare_min"
upsert APACHE_SPARE_MAX      "$spare_max"
