#!/bin/sh
# Copy the theme's variant pieces from a local checkout into the dev site's theme folder.
# Usage: sync_theme.sh <theme_checkout> [site_folder]   (site folder default: saveaplayablockspetelocalnet)
# Copies only functions.php, inc/, templates/ and variants/ (never assets/ or other files), after
# imgcheck.py confirms every design image path is in variants/_img/manifest.json.
set -e
SRC="$1"
SITE="${2:-saveaplayablockspetelocalnet}"
DEST="/var/www/html/$SITE/wp-content/themes/saveaplaya-blocks"
[ -f "$SRC/inc/lp-variants.php" ] || { echo "not a saveaplaya-blocks checkout with variants: $SRC"; exit 1; }
docker exec wp-pete-docker-php-1 test -d "$DEST" || { echo "no theme at $DEST"; exit 1; }
# sap_lp_img() prints nothing for an image missing from the manifest: stop before a blank page ships.
python3 "$(dirname "$0")/imgcheck.py" "$SRC" || { echo "not synced: run import_images.py first"; exit 1; }
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C "$SRC" --exclude='._*' --exclude='.DS_Store' -cf - functions.php inc templates variants \
  | docker exec -i wp-pete-docker-php-1 tar -C "$DEST" -xf -
docker exec wp-pete-docker-php-1 sh -c "chown -R www-data:www-data '$DEST/functions.php' '$DEST/inc' '$DEST/templates' '$DEST/variants' && php -l '$DEST/inc/lp-variants.php' >/dev/null && for f in \$(find '$DEST/variants' -name '*.php'); do php -l \"\$f\" >/dev/null || exit 1; done && echo synced"
