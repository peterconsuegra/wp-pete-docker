#!/bin/bash
# --------------------------------------------------------------------
# Trigger Certbot inside the Apache container
# --------------------------------------------------------------------
SECRET="__RELOAD_SECRET__"        # substituted at build time

echo "Content-Type: text/plain"
echo

# ── Auth check
[ "$HTTP_X_RELOAD_SECRET" = "$SECRET" ] || { echo Forbidden; exit 0; }

# ── Parse query string
DOMAIN="" ; EMAIL=""
IFS='&' read -ra KV <<< "$QUERY_STRING"
for kv in "${KV[@]}"; do
  k="${kv%%=*}" ; v="${kv#*=}"
  [ "$k" = "domain" ] && DOMAIN="$v"
  [ "$k" = "email"  ] && EMAIL="$v"
done
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || { echo "Usage: ?domain=&email="; exit 0; }

echo ">>> certbot --apache -d $DOMAIN -d www.$DOMAIN (this may take a minute) …"
# Run Certbot and capture *both* exit code & stdout
OUT=$(sudo certbot --apache --non-interactive --agree-tos \
                   --reinstall \
                   --redirect \
                   --email "$EMAIL" \
                   -d "$DOMAIN" -d "www.$DOMAIN" 2>&1)
CODE=$?

NAME="${DOMAIN//./}"
cd /var/www/html/Pete/scripts && sudo ./refine_ssl.sh -n {$NAME} -d {$DOMAIN}
sudo /usr/sbin/apachectl -k graceful    


echo "$OUT"
echo ">>> exit-code: $CODE"
[ $CODE -eq 0 ] && echo "CERTBOT_SUCCESS" || echo "CERTBOT_FAILED"

exit 0
