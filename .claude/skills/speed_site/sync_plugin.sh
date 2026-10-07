#!/bin/sh
# Copy a plugin from its git repo into a Pete Panel dev site (default: the shared Reblock Page Speed).
#   sync_plugin.sh <dev_url> [plugin_dir]     plugin_dir default ~/Sites/projects/reblock-page-speed
# The folder is swapped whole (nothing stale stays), owned by www-data, every PHP file linted; WP
# Fastest Cache's page files are emptied. Activation is a step of its own.
set -e
SITE="$1"
SRC="${2:-$HOME/Sites/projects/reblock-page-speed}"
[ -n "$SITE" ] || { echo "usage: sync_plugin.sh <dev_url> [plugin_dir]"; exit 1; }
case "$SITE" in *.petelocal.net*) ;; *) echo "refusing $SITE: only *.petelocal.net dev sites"; exit 1 ;; esac
[ -d "$SRC" ] || { echo "no plugin at $SRC (clone it: git clone git@github.com:peterconsuegra/reblock-page-speed.git $SRC)"; exit 1; }
SLUG=$(basename "$SRC")
FOLDER=$(printf '%s' "$SITE" | sed -e 's#^[a-z]*://##' -e 's#/.*$##' -e 's/\.//g')
C=wp-pete-docker-php-1
ROOT="/var/www/html/$FOLDER"
DEST="$ROOT/wp-content/plugins/$SLUG"
docker exec "$C" test -f "$ROOT/wp-config.php" || { echo "no WordPress at $ROOT"; exit 1; }
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C "$SRC" --exclude=.git --exclude='._*' --exclude=.DS_Store --exclude='*.zip' -cf - . \
  | docker exec -i "$C" sh -c "
      set -e
      rm -rf '$DEST.new' '$DEST.old'
      mkdir -p '$DEST.new'
      tar -C '$DEST.new' -xf -
      for f in \$(find '$DEST.new' -name '*.php'); do php -l \"\$f\" >/dev/null || { echo \"php -l failed: \$f\"; rm -rf '$DEST.new'; exit 1; }; done
      chown -R www-data:www-data '$DEST.new'
      if [ -d '$DEST' ]; then mv '$DEST' '$DEST.old'; fi
      mv '$DEST.new' '$DEST'
      rm -rf '$DEST.old' '$ROOT/wp-content/cache/all'
      echo \"synced \$(find '$DEST' -type f | wc -l | tr -d ' ') files to $DEST\"
    "
