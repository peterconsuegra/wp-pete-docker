#!/usr/bin/env bash
set -e

# Only bootstrap wp-config.php once
WP_CONFIG=/var/www/html/wp-config.php
if [ ! -f "$WP_CONFIG" ]; then
  cp /var/www/html/wp-config-sample.php "$WP_CONFIG"

  # Inject our Docker-compose env vars
  sed -i "s/database_name_here/${DB_NAME}/"       "$WP_CONFIG"
  sed -i "s/username_here/${DB_USER}/"            "$WP_CONFIG"
  sed -i "s/password_here/${DB_PASS}/"            "$WP_CONFIG"
  sed -i "s/'DB_HOST', 'localhost'/'DB_HOST', 'db'/" "$WP_CONFIG"

  chown www-data:www-data "$WP_CONFIG"
fi

# Hand off to the official entrypoint (sets up PHP, then runs CMD)
exec docker-php-entrypoint "$@"