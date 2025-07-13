#!/bin/bash
# simple CGI that reloads Apache only if the shared secret matches

SECRET="__RELOAD_SECRET__"    # will be substituted in the Dockerfile

echo "Content-Type: text/plain"
echo

if [ "$HTTP_X_RELOAD_SECRET" != "$SECRET" ]; then
  echo "Forbidden"
  exit 0
fi

if test "$mod_sw" = 'on'; then
	
		echo "ex -sc '%s/SecRuleEngine Off/SecRuleEngine On/|x' /etc/modsecurity/modsecurity.conf"
		sudo ex -sc '%s/SecRuleEngine Off/SecRuleEngine On/|x' /etc/modsecurity/modsecurity.conf

fi

if test "$mod_sw" = 'off'; then
		
		echo "ex -sc '%s/SecRuleEngine On/SecRuleEngine Off/|x' /etc/modsecurity/modsecurity.conf"
		sudo ex -sc '%s/SecRuleEngine On/SecRuleEngine Off/|x' /etc/modsecurity/modsecurity.conf

fi

# graceful reload (keeps current connections)
sudo /usr/sbin/apachectl -k graceful

echo "Mod security status updated"
