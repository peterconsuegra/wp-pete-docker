#!/bin/bash
# --------------------------------------------------------------------
# Trigger Certbot from inside the Apache container
#   curl -H "X-Reload-Secret: $APACHE_RELOAD_SECRET" \
#        "http://apache/internal-certbot?domain=demo3.wordpresspete.org&email=pedroconsuegrat@gmail.com"
# --------------------------------------------------------------------

SECRET="__RELOAD_SECRET__"        # will be substituted at build-time

# ── CGI header
echo "Content-Type: text/plain"
echo

# ── Same auth check as reload_apache.cgi
if [ "$HTTP_X_RELOAD_SECRET" != "$SECRET" ]; then
  echo "Forbidden"
  exit 0
fi

# ── Parse query string (?domain=…&email=…)
DOMAIN=""
EMAIL=""
IFS='&' read -ra KV <<< "$QUERY_STRING"
for pair in "${KV[@]}"; do
  key="${pair%%=*}"
  val="${pair#*=}"
  case "$key" in
    domain) DOMAIN="$val" ;;
    email)  EMAIL="$val"  ;;
  esac
done

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: ?domain=<example.com>&email=<you@host>"
  exit 0
fi

#echo "Issuing / renewing certificate for $DOMAIN …"
sudo certbot --apache --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN"

echo "Done"
