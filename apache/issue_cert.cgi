#!/bin/bash
# Trigger Certbot inside the Apache container
# --------------------------------------------
set -euo pipefail

SECRET="__RELOAD_SECRET__"        # substituted at build time

echo "Content-Type: text/plain"
echo

# ── Auth check
[[ "${HTTP_X_RELOAD_SECRET:-}" == "$SECRET" ]] || { echo "Forbidden"; exit 0; }

# ── Parse query string
DOMAIN="" ; EMAIL=""
IFS='&' read -ra KV <<< "${QUERY_STRING:-}"
for kv in "${KV[@]}"; do
  k="${kv%%=*}" ; v="${kv#*=}"
  [[ "$k" == "domain" ]] && DOMAIN="$v"
  [[ "$k" == "email"  ]] && EMAIL="$v"
done
[[ -n "$DOMAIN" && -n "$EMAIL" ]] || { echo "Usage: ?domain=&email="; exit 0; }

# ── NEW: name without dots (demo1.wordpresspete.org → demo1wordpresspeteorg)
NAME="${DOMAIN//./}"

echo ">>> certbot --apache -d $DOMAIN -d www.$DOMAIN (this may take a minute) …"
OUT=$(sudo certbot --apache --non-interactive --agree-tos \
                   --redirect \
                   --email "$EMAIL" \
                   -d "$DOMAIN" -d "www.$DOMAIN" 2>&1)
CODE=$?

# ── Replace any existing (legacy) configs that used the dot-stripped name
sudo rm -f "/etc/apache2/sites-available/${NAME}.conf" \
          "/etc/apache2/sites-enabled/${NAME}.conf"

# ── Add an HTTP-to-HTTPS redirect vHost into the SSL file Certbot created
cat <<EOF | sudo tee -a "/etc/apache2/sites-available/${DOMAIN}-le-ssl.conf" >/dev/null
<VirtualHost *:80>
    ServerName  ${DOMAIN}
    ServerAlias www.${DOMAIN}
    Redirect permanent / https://${DOMAIN}/
</VirtualHost>
EOF

sudo /usr/sbin/apachectl -k graceful    # zero-downtime reload

echo "$OUT"
echo ">>> exit-code: $CODE"
[[ $CODE -eq 0 ]] && echo "CERTBOT_SUCCESS" || echo "CERTBOT_FAILED"
exit 0
