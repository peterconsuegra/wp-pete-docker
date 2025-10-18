#!/bin/bash
set -e

# Wait until PHP (Pete installer) has populated the volume
echo "Waiting for Pete document root…"
while [ ! -d "/var/www/html/Pete/public" ]; do
  sleep 2
done

mkdir -p /var/log/apache2
touch    /var/log/apache2/modsec_audit.log
chown -R www-data:www-data /var/log/apache2
chmod 750 /var/log/apache2

# Ensure log directory exists
mkdir -p /var/www/html/wwwlog/Pete

mkdir -p /var/cache/apache2/mod_cache_disk/tmp
chown -R www-data:www-data /var/cache/apache2
chmod -R 750 /var/cache/apache2  
chmod 750 /var/cache/apache2/mod_cache_disk/tmp


# --- ADD THIS BLOCK ---------------------------------------------------
# Lightweight logrotate scheduler (no cron needed)
if command -v logrotate >/dev/null 2>&1; then
  LOGROTATE_CONF="/etc/logrotate.conf"
  LOGROTATE_STATE="/var/lib/logrotate/status"
  INTERVAL="${LOGROTATE_INTERVAL:-86400}"    # seconds; default: 24h

  (
    # Run once immediately to catch an oversized file at boot
    /usr/sbin/logrotate -s "$LOGROTATE_STATE" "$LOGROTATE_CONF" || true
    # Then loop forever
    while sleep "$INTERVAL"; do
      /usr/sbin/logrotate -s "$LOGROTATE_STATE" "$LOGROTATE_CONF" || true
    done
  ) &
fi

exec apachectl -D FOREGROUND




