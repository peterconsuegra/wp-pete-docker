#!/usr/bin/env bash
# bin/tune_apache_env.sh
# -------------------------------------------
# Detect host-level CPU/RAM   → calculate Apache MPM numbers
# Upsert them into .env       → docker-compose picks them up
# -------------------------------------------
set -euo pipefail

ENV_FILE=".env"

#############################################
# 0) Read host capacity (Linux, no sudo needed)
#############################################
cpu_count=$(nproc)                               # 2, 4, 8, …
mem_bytes=$(awk '/MemTotal/ {print $2*1024}' /proc/meminfo)
mem_gib=$(( mem_bytes / 1024 / 1024 / 1024 ))    # round down

#############################################
# 1) Heuristics – tweak to taste
#############################################
threads_per_child=64
case "$mem_gib" in
  0|1|2|3|4) start_servers=2 ;;   # ≤ 4 GiB RAM
  5|6|7|8)   start_servers=4 ;;   #   5–8 GiB
  *)         start_servers=8 ;;   # ≥ 9 GiB
esac

server_limit=$(( cpu_count * start_servers ))
max_workers=$(( server_limit * threads_per_child ))
spare_min=$threads_per_child
spare_max=$(( threads_per_child * 3 ))

#############################################
# 2) Helper → insert or replace KEY=value
#############################################
upsert () {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE"; then
    sed -i "s/^${k}=.*/${k}=${v}/" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

#############################################
# 3) Write values into .env
#############################################
upsert APACHE_THREADS        "$threads_per_child"
upsert APACHE_MAX_WORKERS    "$max_workers"
upsert APACHE_SERVER_LIMIT   "$server_limit"
upsert APACHE_START_SERVERS  "$start_servers"
upsert APACHE_SPARE_MIN      "$spare_min"
upsert APACHE_SPARE_MAX      "$spare_max"

echo "✓ .env updated:"
grep -E '^APACHE_(THREADS|MAX_WORKERS|SERVER_LIMIT|START_SERVERS|SPARE_.*)=' "$ENV_FILE"
