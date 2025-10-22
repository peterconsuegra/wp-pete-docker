#!/bin/bash
# ------------------------------------------------------------------
# Run *as root* – toggles SecRuleEngine On|Off, then graceful reload.
# ------------------------------------------------------------------
set -euo pipefail
CONF="/etc/modsecurity/modsecurity.conf"

case "${1:-}" in
  on)  sed -i 's/^SecRuleEngine.*/SecRuleEngine On/'  "$CONF" ;;
  off) sed -i 's/^SecRuleEngine.*/SecRuleEngine Off/' "$CONF" ;;
  *)   echo "Usage: $0 {on|off}" ; exit 1 ;;
esac

/usr/sbin/apachectl -k graceful
