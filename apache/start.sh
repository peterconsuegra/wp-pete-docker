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

exec apachectl -D FOREGROUND