# __NAME__ block theme

Built by `/reblock_site` from `__SOURCE__` on __DATE__, on the Pete Panel dev site __SITE__.

## How it is put together

- **Pages are files.** `templates/front-page.html` and `templates/page-<slug>.html` are made of
  patterns (`patterns/<page>-<section>.php`). WordPress picks `page-<slug>.html` for the page with that
  slug, so a page only needs to exist with the right slug. Nothing is stored in the database: do not
  save templates in the Site Editor (that copies them into the database, and the files stop counting).
- **The design's code is verbatim.** `assets/css/site.css` and `assets/js/site.js` are the export's
  own CSS and JS, written by `import_assets.py` (only `url()`s rewritten). Everything the port adds is
  in `assets/css/port.css` and `assets/js/port.js`.
- **Assets keep the export's paths.** `assets/manifest.json` maps `assets/photos/hero.jpg` (the
  export's path) to the theme file (`assets/img/photos/hero.webp`); patterns print
  `<?php __PREFIX___the_asset( 'assets/photos/hero.jpg' ); ?>`. Links between pages use
  `__PREFIX___the_link( '<page slug>' )`.
- Header and footer: `patterns/header.php` and `patterns/footer.php` (PHP, so per-page variants and
  the current page work), included by `parts/header.html` / `parts/footer.html`.
- Optional form backend: `inc/forms.php` (entries in wp-admin > Form entries, emailed to the admin).

## Working on it

Edit here, then copy into the dev site with the skill's `sync.sh` (it runs `themecheck.py` first
and clears the pattern cache). A new version of the export: re-run `import_assets.py` (replaces
site.css, site.js, fonts.css; adds new images), compare, adjust the patterns.
