#!/bin/sh
# Copy a /reblock_site theme from its git repo into a Pete Panel dev site.
# Usage: sync.sh <theme_dir> <dev_url | site_folder>
#   e.g. sync.sh ~/Sites/projects/playmethod-blocks-theme http://playmethod.petelocal.net
# Runs themecheck.py first and stops on errors. The theme folder is the Text Domain in style.css.
# The folder is swapped whole (a renamed or deleted pattern never lingers), owned by www-data, every
# PHP file linted; then WordPress's theme pattern cache and WP Fastest Cache's files are cleared.
# Never activates anything: activation is a step of its own in the skill.
set -e
SRC="$1"
SITE="$2"
[ -n "$SRC" ] && [ -n "$SITE" ] || { echo "usage: sync.sh <theme_dir> <dev_url|site_folder>"; exit 1; }
[ -f "$SRC/style.css" ] || { echo "not a theme folder: $SRC"; exit 1; }
SLUG=$(sed -n 's/^Text Domain:[[:space:]]*\([a-z0-9-]*\).*/\1/p' "$SRC/style.css" | head -1)
[ -n "$SLUG" ] || { echo "no Text Domain in $SRC/style.css"; exit 1; }
# http://playmethod.petelocal.net/x -> playmethodpetelocalnet (Pete Panel's folder convention).
FOLDER=$(printf '%s' "$SITE" | sed -e 's#^[a-z]*://##' -e 's#/.*$##' -e 's/\.//g')
case "$SITE" in *.petelocal.net*|*petelocalnet) ;; *) echo "refusing $SITE: only *.petelocal.net dev sites"; exit 1 ;; esac
C=wp-pete-docker-php-1
ROOT="/var/www/html/$FOLDER"
DEST="$ROOT/wp-content/themes/$SLUG"
docker exec "$C" test -f "$ROOT/wp-config.php" || { echo "no WordPress at $ROOT"; exit 1; }

python3 "$(dirname "$0")/themecheck.py" "$SRC" || { echo "not synced: fix the errors above"; exit 1; }

COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C "$SRC" --exclude=.git --exclude=.gitignore --exclude=.gitattributes --exclude=.reblock --exclude='._*' --exclude=.DS_Store --exclude='*.zip' -cf - . \
  | docker exec -i "$C" sh -c "
      set -e
      rm -rf '$DEST.new' '$DEST.old'
      mkdir -p '$DEST.new'
      tar -C '$DEST.new' -xf -
      for f in \$(find '$DEST.new' -name '*.php'); do php -l \"\$f\" >/dev/null || { echo \"php -l failed: \$f\"; rm -rf '$DEST.new'; exit 1; }; done
      chown -R www-data:www-data '$DEST.new'
      if [ -d '$DEST' ]; then mv '$DEST' '$DEST.old'; fi
      mv '$DEST.new' '$DEST'
      rm -rf '$DEST.old'
      echo \"synced \$(find '$DEST' -type f | wc -l | tr -d ' ') files to $DEST\"
      for d in all wpfc-minified supercache; do
        if [ -d '$ROOT/wp-content/cache/'\$d ]; then rm -rf '$ROOT/wp-content/cache/'\$d; echo \"cleared wp-content/cache/\$d\"; fi
      done
    "
docker exec -u www-data -w "$ROOT" "$C" wp eval "
  \$t = wp_get_theme( '$SLUG' );
  if ( \$t->exists() && method_exists( \$t, 'delete_pattern_cache' ) ) { \$t->delete_pattern_cache(); }
  wp_cache_flush();
  echo 'pattern cache cleared; active theme: ' . get_stylesheet() . PHP_EOL;
"
