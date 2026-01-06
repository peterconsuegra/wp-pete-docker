#!/usr/bin/env bash
set -e

CRON_DST="/etc/cron.d/pete-panel"

# Check these locations (first match wins)
for f in /var/www/html/cronjob.txt /opt/cronjob.txt /run/secrets/cronjob.txt; do
  if [ -f "$f" ] && [ -s "$f" ]; then
    echo "cronjob.txt found at $f, replacing $CRON_DST"
    cp "$f" "$CRON_DST"
    chmod 0644 "$CRON_DST"
    break
  fi
done

# Start cron (don’t fail container boot)
service cron start >/dev/null 2>&1 || cron || true

echo "Active cron file:"
cat "$CRON_DST"
