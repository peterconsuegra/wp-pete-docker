#!/bin/sh
# WP Fastest Cache on a Pete Panel dev site, set the /speed_site way.
#   wpfc.sh <dev_url> on [backup_dir]   install (wordpress.org) + activate + settings + .htaccess rules, then prove a page is served from the cache
#   wpfc.sh <dev_url> status            settings, .htaccess blocks, cached files
#   wpfc.sh <dev_url> off               cache off (WPFC removes its .htaccess rules) and the plugin deactivated
# Settings: page cache on (not for logged-in users), cleared on publish and update, gzip, browser
# caching for static files (versioned ?ver= URLs make that safe), emoji off. Off on purpose: HTML,
# CSS and JS minify and combine (Combine JS re-merges deferred scripts into one blocking file),
# mobile cache (one responsive HTML for all), preload (a cron crawler).
# The settings go through WPFC's own saveOption(), so .htaccess gets exactly the rules a save in
# wp-admin writes. on keeps a copy of .htaccess in backup_dir (never in the web root).
set -e
URL="$1"
ACTION="$2"
BACKUP="$3"
[ -n "$URL" ] && [ -n "$ACTION" ] || { echo "usage: wpfc.sh <dev_url> on|status|off [backup_dir]"; exit 1; }
case "$URL" in http://*.petelocal.net*|https://*.petelocal.net*) ;; *) echo "refusing $URL: only *.petelocal.net dev sites"; exit 1 ;; esac
URL=$(printf '%s' "$URL" | sed -e 's#^\(https\{0,1\}://[^/]*\).*#\1#')
FOLDER=$(printf '%s' "$URL" | sed -e 's#^[a-z]*://##' -e 's/\.//g')
C=wp-pete-docker-php-1
ROOT="/var/www/html/$FOLDER"
# Never --url=<a cached page>: with WP Fastest Cache active, WP-CLI then prints that cached page and
# exits instead of running the command. saveOption() needs HTTP_HOST, so it gets an uncached path.
wpcli() { docker exec -u www-data -w "$ROOT" "$C" wp "$@"; }
docker exec "$C" test -f "$ROOT/wp-config.php" || { echo "no WordPress at $ROOT"; exit 1; }

save_settings() { # $1 = on|off
  wpcli --url="$URL/wp-cli/" eval "
    require_once ABSPATH . 'wp-admin/includes/template.php';
    require_once WP_PLUGIN_DIR . '/wp-fastest-cache/inc/admin.php';
    \$_POST = array( 'wpFastestCachePage' => 'options', 'wpFastestCacheLanguage' => 'eng' );
    if ( '$1' === 'on' ) {
      \$_POST += array(
        'wpFastestCacheStatus' => 'on', 'wpFastestCacheLoggedInUser' => 'on',
        'wpFastestCacheNewPost' => 'on', 'wpFastestCacheNewPost_type' => 'all',
        'wpFastestCacheUpdatePost' => 'on', 'wpFastestCacheUpdatePost_type' => 'all',
        'wpFastestCacheGzip' => 'on', 'wpFastestCacheLBC' => 'on', 'wpFastestCacheDisableEmojis' => 'on',
      );
    }
    ( new WpFastestCacheAdmin() )->saveOption();
    foreach ( get_settings_errors( 'wpfc-notice' ) as \$e ) { echo \$e['type'], ': ', wp_strip_all_tags( \$e['message'] ), PHP_EOL; }
  "
}

case "$ACTION" in
on)
  [ -n "$(wpcli option get permalink_structure)" ] || { echo "plain permalinks: WP Fastest Cache refuses them (set /%postname%/ first)"; exit 1; }
  if [ -n "$BACKUP" ]; then mkdir -p "$BACKUP" && docker cp "$C:$ROOT/.htaccess" "$BACKUP/htaccess-before-wpfc" 2>/dev/null && echo "backup: $BACKUP/htaccess-before-wpfc"; fi
  wpcli plugin is-installed wp-fastest-cache || wpcli plugin install wp-fastest-cache
  wpcli plugin activate wp-fastest-cache
  save_settings on
  docker exec "$C" sh -c "rm -rf '$ROOT/wp-content/cache/all'"
  curl -s -o /dev/null "$URL/"
  BODY=$(curl -s "$URL/")
  case "$BODY" in
    *"WP Fastest Cache file was created"*"via php"*) echo "home: cached, but served through PHP (the .htaccess rules are not used)";;
    *"WP Fastest Cache file was created"*) echo "home: served from the cache by Apache (no PHP)";;
    *) echo "home: NOT cached (no WP Fastest Cache comment in the second response)"; exit 1;;
  esac
  ;;
status)
  wpcli plugin list --name=wp-fastest-cache --fields=name,status,version --format=csv
  wpcli option get WpFastestCache 2>/dev/null || echo "no settings saved"
  docker exec "$C" sh -c "grep -o 'BEGIN [A-Za-z]*WpFastestCache' '$ROOT/.htaccess' | sort -u; echo \"cached files: \$(find '$ROOT/wp-content/cache/all' -name 'index.html' 2>/dev/null | wc -l | tr -d ' ')\""
  ;;
off)
  if wpcli plugin is-active wp-fastest-cache; then save_settings off; wpcli plugin deactivate wp-fastest-cache; fi
  docker exec "$C" sh -c "rm -rf '$ROOT/wp-content/cache/all' '$ROOT/wp-content/cache/wpfc-minified'"
  echo "WP Fastest Cache off; .htaccess blocks left: $(docker exec "$C" sh -c "grep -c 'WpFastestCache' '$ROOT/.htaccess'" || true)"
  ;;
*) echo "unknown action $ACTION"; exit 1 ;;
esac
