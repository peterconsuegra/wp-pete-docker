#!/bin/bash
# --------------------------------------------------------------------
# Trigger Certbot inside the Apache container
#   • Issues for both $DOMAIN and www.$DOMAIN when the www record
#     exists in DNS (vhosts already carry "ServerAlias www.<domain>").
#   • Falls back to $DOMAIN alone if the two-name attempt fails, so
#     behavior is never worse than the original single-domain flow.
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

run_certbot() {
  sudo certbot --apache --non-interactive --agree-tos \
               --reinstall \
               --redirect \
               --expand \
               --email "$EMAIL" \
               "$@" 2>&1
}

# ── Decide whether to include www.<domain>
#    Skip when the domain already starts with www., or when the www
#    record doesn't resolve (subdomain sites usually have none —
#    including it would fail the whole issuance).
DOMAIN_ARGS=(-d "$DOMAIN")
WWW_INCLUDED=no
case "$DOMAIN" in
  www.*) : ;;
  *)
    if getent hosts "www.$DOMAIN" >/dev/null 2>&1; then
      DOMAIN_ARGS+=(-d "www.$DOMAIN")
      WWW_INCLUDED=yes
    else
      echo ">>> www.$DOMAIN has no DNS record - issuing for $DOMAIN only"
    fi
    ;;
esac

echo ">>> certbot --apache ${DOMAIN_ARGS[*]} (this may take a minute) …"
OUT=$(run_certbot "${DOMAIN_ARGS[@]}")
CODE=$?

# ── Fallback: if the www-inclusive attempt failed (e.g. DNS resolves
#    via wildcard but ACME validation fails), retry apex-only so the
#    site still gets its certificate.
if [ $CODE -ne 0 ] && [ "$WWW_INCLUDED" = "yes" ]; then
  echo "$OUT"
  echo ">>> two-name attempt failed (exit $CODE) - retrying with $DOMAIN only …"
  OUT=$(run_certbot -d "$DOMAIN")
  CODE=$?
fi

echo "$OUT"
echo ">>> exit-code: $CODE"
[ $CODE -eq 0 ] && echo "CERTBOT_SUCCESS" || echo "CERTBOT_FAILED"

exit 0
