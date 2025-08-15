#!/bin/bash
# --------------------------------------------------------------------
# /usr/local/bin/modsecurity_status.cgi
#
# Toggle ModSecurity’s SecRuleEngine (On | Off) from a Pete admin call.
#  • Verifies X-Reload-Secret header.
#  • Expects ?sw=on|off query param.
#  • Delegates the sensitive work to /usr/local/bin/toggle_modsec.sh,
#    executed via sudo without a password or TTY (see sudoers rule).
#  • Emits MODSECURITY_SUCCESS | MODSECURITY_FAILED banner, mirroring
#    the style of issue_cert.cgi so Laravel can parse it if desired.
# --------------------------------------------------------------------

SECRET="__RELOAD_SECRET__"          # ⬅ replaced at build time
HELPER="/usr/local/bin/toggle_modsec.sh"

echo "Content-Type: text/plain"
echo

#Header-based authentication
if [ "$HTTP_X_RELOAD_SECRET" != "$SECRET" ] ; then
  echo "Forbidden"
  exit 0
fi

#2 Query-string parsing (?sw=on|off)
SW=""
IFS='&' read -ra KV <<< "$QUERY_STRING"
for kv in "${KV[@]}"; do
  k="${kv%%=*}" ; v="${kv#*=}"
  [ "$k" = "sw" ] && SW="$v"
done

case "$SW" in
  on|off) ;;                      
  *) echo "Usage: ?sw=on|off" ; exit 0 ;;
esac

#3Run helper via sudo (NOPASSWD, !requiretty)
echo ">>> sudo $HELPER $SW"
OUT=$(sudo -n "$HELPER" "$SW" 2>&1)
CODE=$?

echo "$OUT"
echo ">>> exit-code: $CODE"

if [ $CODE -eq 0 ]; then
  echo "MODSECURITY_SUCCESS"
else
  echo "MODSECURITY_FAILED"
fi

exit 0
