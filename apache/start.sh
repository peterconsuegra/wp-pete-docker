#!/bin/bash
set -e

# Wait until PHP (Pete installer) has populated the volume
echo "Waiting for Pete document root…"
while [ ! -d "/var/www/html/Pete/public" ]; do
  sleep 2
done

# Ensure log directory exists
mkdir -p /var/www/html/wwwlog/Pete

exec apachectl -D FOREGROUND