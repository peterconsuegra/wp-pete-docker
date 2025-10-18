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

echo '<VirtualHost _default_:80>
    ServerName localhost
    DocumentRoot /var/www/html/Pete/public

    <Directory /var/www/html/Pete/public>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Long-running operations (site clone) can exceed 60s
    Timeout 1800
    ProxyTimeout 1800

    LimitRequestBody 0

    <Location "/wordpress-importer">
        SecRuleEngine Off
        SecRequestBodyAccess Off
    </Location>

    <Location "/wordpress-importer/upload-chunk">
        SecRuleEngine Off
        SecRequestBodyAccess Off
    </Location>

    # send PHP to FPM
    <FilesMatch "\.php$">
        SetHandler "proxy:fcgi://php:9000"
    </FilesMatch>

    # graceful-reload hook (now inside the vhost)
    ScriptAlias /internal-reload /usr/local/bin/reload_apache.cgi
    <Directory "/usr/local/bin">
        Options +ExecCGI
        Require local
        Require ip 172.16.0.0/12
    </Directory>

    ScriptAlias /internal-certbot /usr/local/bin/issue_cert.cgi
    <Directory "/usr/local/bin">
        Options +ExecCGI
        Require local
        Require ip 172.16.0.0/12
    </Directory>

    ScriptAlias /modsecurity-status /usr/local/bin/modsecurity_status.cgi
    <Directory "/usr/local/bin">
        Options +ExecCGI
        Require local
        Require ip 172.16.0.0/12
    </Directory>

    LogLevel debug
    ErrorLog  /var/www/html/wwwlog/Pete/error.log
    CustomLog /var/www/html/wwwlog/Pete/access.log combined
</VirtualHost>' > /opt/pete-apache/000-pete.conf


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




