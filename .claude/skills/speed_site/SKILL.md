---
name: speed_site
description: Speed up a site built with /reblock_site for Core Web Vitals on its Pete Panel dev site, with the site's OWN speed plugin (<brand>-page-speed, its own repo) made from this skill's template. Measures every page with Lighthouse (phone and desktop), finds each page's first-screen image and fonts and where the theme's photos show at every width, then generates the plugin (inline theme CSS and small scripts, first-screen preloads, videos after the first paint, srcset copies of big photos with measured sizes, optional delay of tracking tags, no browser caching of HTML) and turns on WP Fastest Cache. Proves the pages are pixel-identical to before, every feature works and the scores moved. Local-only; never deploys. Run after /reblock_site. Args: DEV_URL. Example: /speed_site http://playmethod.petelocal.net
---

# speed_site: Core Web Vitals for a /reblock_site site, with the site's own speed plugin

Runs after `/reblock_site` on the same dev site. Three pieces, all verified:
1. **WP Fastest Cache**: Apache serves saved pages without PHP (server response ~10 ms).
2. **The site's own plugin**, `<BRAND>-page-speed`: its own repo in `~/Sites/projects/`, made from
   this skill's template (`plugin/`) by `scaffold_plugin.py`. Settings > Page Speed has one checkbox
   per feature:
   - the theme's CSS inline, and its small classic scripts inline;
   - each page's first-screen image and fonts preloaded;
   - videos after the first paint (later posters in the size the screen needs);
   - srcset copies of the theme's big photos, with sizes measured against the layout;
   - third-party tags after the first interaction (only on the owner's yes);
   - no browser caching of HTML.
3. **Its `includes/site.php`**: the only file with site data. It says each page's first-screen
   items and fonts, where each photo shows and how wide, which video keeps its poster, and which
   tags wait. The probes write it; you check it against Lighthouse.

Why one plugin per site (Pedro, 2026-10-07): a site plugin carries exactly what that site needs,
and ships, rolls back and gets tuned on its own. The shared Reblock Page Speed plugin and the theme's
`speed.json` are retired. The Play Method ran the shared plugin for a day; its folder stays there,
deactivated, for rollback. The generated plugin stays off while the shared one is active. To move a
site, activate the site plugin first, then deactivate the shared one, so the site is never without one.

The rule: the speed work never changes the look. Pages must be pixel-identical before and after,
except inside a photo that now comes from a smaller copy (resampling, a few levels).

Reference: The Play Method, 2026-10-07 (`playmethod-page-speed`, the template's source).
- On PageSpeed Insights phones, About's first paint went 1.5 s → 0.33 s (`site.js` inline): Speed
  Index 2.5 → 0.9 s.
- Phones download the 37 KB copy of a 107 KB photo.
- Phones score 99-100, desktop 100.
- The first speed pass (shared plugin, the same day) took home from 97 to 99 and LCP from 1.9 to
  1.6 s on production; render-blocking requests went to 0.

## Arguments

- `DEV_URL`: the Pete Panel dev site /reblock_site built (`http://<name>.petelocal.net`).

Derived:
- `SITE_FOLDER`: the host without dots.
- `THEME`: the active theme (`wp option get stylesheet`).
- `BRAND`: THEME without `-blocks`.
- `REPO`: `~/Sites/projects/<THEME>-theme`, with `.reblock/pages.json`.
- `PLUGIN`: `~/Sites/projects/<BRAND>-page-speed`.
- `NAME`: "<Brand> Page Speed".
- `PREFIX`: a few letters ending in "ps" (`pmps`). It names the PHP functions and data- attributes.
- `WORK`: `<scratchpad>/speed/<THEME>/`.
- WP-CLI: `docker exec -u www-data -w /var/www/html/<SITE_FOLDER> wp-pete-docker-php-1 wp …`.
  Never with `--url=<a cached page>`: with WP Fastest Cache active, WP-CLI then prints that page and
  exits without running the command.

## Tools

In this folder; they reuse `/reblock_site`'s tools (`../reblock_site/`). Lighthouse lives in
`~/.cache/claude-skills/lighthouse`. If it's missing:
`mkdir -p ~/.cache/claude-skills/lighthouse && cd ~/.cache/claude-skills/lighthouse && npm init -y && npm install lighthouse`.
Python scripts that use Pillow run with the wp-pete-docker python (the scratchpad's has no Pillow).

| Tool | What it does |
|---|---|
| `lh.mjs <pages.json> <out> [keys] [--runs=3] [--form=mobile,desktop] [--compare=<before_out>] [--throttling=devtools]` | Lighthouse performance, per-metric medians, LCP element, render-blocking count; before → after table. HTTPS-Upgrades off (an http dev site would pay a failed https try). |
| `lcpprobe.mjs <pages.json> [keys] --out=<hints.json>` | Each page's LCP element at 7 widths and the font files of its first screen: a draft of every-page fonts and per-page items (class hints survive content changes, e.g. a journal's lead post). |
| `imgwidths.mjs <pages.json> [keys] --out=<photos.json>` | Every theme photo and video poster measured at 320-1920 px (step 20): a `sizes` fitted per page, and the copy widths worth making. |
| `scaffold_plugin.py <PLUGIN> --name= --site= --theme= --prefix= --hints=a,b --photos=a,b [--keep-poster=<class>] [--delay=<handles>]` | The plugin from `plugin/`: names filled in, `includes/site.php` and `bin/variants.py` from the probes. Several hints/photos files are merged (pages, then posts). |
| `PLUGIN/bin/variants.py` | The photo copies (WebP, the theme's quality) and `assets/img/variants.json`. |
| `PLUGIN/bin/check.mjs <site> [paths]` | The definition of done, phone and desktop: from the page cache, no-cache on PHP HTML, no theme stylesheet links, preloads used, video files only after the first paint, the right photo copy, held-back tags run after a scroll, no console errors. Ends with "page speed checks ok". Works on production too. |
| `sync_plugin.sh <DEV_URL> <PLUGIN>` | The plugin into the site (whole-folder swap, php -l, cache emptied). |
| `wpfc.sh <DEV_URL> on [backup_dir] \| status \| off` | WP Fastest Cache through its own `saveOption()`. `on` keeps a copy of `.htaccess` in backup_dir, never in the web root, and proves home comes from the cache by Apache. |
| `psi_report.js` | Reads a PageSpeed Insights report page (see "Reading PageSpeed Insights"). |
| `../reblock_site/shots.mjs … --tag=before\|after --mask-videos` + `compare.py --pair=before,after --diff` | Pixel proof that nothing moved. |
| `../reblock_site/sitecheck.mjs <pages.json> site` | Errors, overflow, menu, links. |

WP Fastest Cache settings (fixed by `wpfc.sh`):
- **On:** page cache (not for logged-in users), cleared on publish and update, gzip, browser
  caching of static files (the theme's `?ver=filemtime` URLs make that safe), emoji off.
- **Off, and keep them off:**
  - HTML, CSS and JS minify and combine. Combine JS re-merges deferred scripts into one blocking
    file, and the CSS is already inline.
  - "Remove query strings" (it served stale JS for a year at Save a Playa).
  - The separate mobile cache (one responsive HTML serves every device).
  - Preload (a cron crawler).

## 0. Preflight

1. `DEV_URL` is `*.petelocal.net`; the site exists. The active theme must be a /reblock_site theme:
   `assets/manifest.json` exists, and `REPO/.reblock/pages.json` too. Otherwise stop: this skill
   builds on /reblock_site's work list and pixel tools.
2. `PLUGIN` must not exist yet; if it does, this is a re-run: read its `includes/site.php` and git
   log, and change that plugin instead of scaffolding. Lighthouse must be installed.
3. Note the site's state for the rollback: active plugins, the `WpFastestCache` option, a copy of
   `.htaccess` (`wpfc.sh on` makes it).
4. Permalinks must not be plain: /reblock_site sets them, and WP Fastest Cache refuses plain ones.

## 1. Baseline (before anything changes)

```sh
mkdir -p "$WORK" && cp "$REPO/.reblock/pages.json" "$WORK/"       # set "site" to DEV_URL if it differs
node lh.mjs "$WORK/pages.json" "$WORK/lh-before"                    # 3 runs, phone and desktop
node ../reblock_site/shots.mjs "$WORK/pages.json" site "$WORK/shots" --tag=before --mask-videos
node lcpprobe.mjs "$WORK/pages.json" --out="$WORK/hints-pages.json"
node imgwidths.mjs "$WORK/pages.json" --out="$WORK/photos-pages.json"
```

If the site has posts, make `WORK/pages-posts.json`: entries keyed by the plugin's page keys, `post`
for a single post (path = a real post) and the archive paths. Run the same four tools on it
(`hints-posts.json`, `photos-posts.json`). Page keys must be what the plugin computes: `home`, a
page's path (`about`, `parent/child`), `post`. /reblock_site's keys are the slugs, so they match.

Read the Lighthouse table: each page's LCP element, the render-blocking requests, and what the
insights flag (image delivery, LCP discovery, font chains).

## 2. Decisions (ask only when it applies)

- **Third-party tags.** If the site loads tracking or chat scripts, ask the owner:
  - start them after the first interaction (better scores and INP; visitors who leave within 10 s
    without touching the page are not counted), or
  - keep them immediate (the default).

  Dev copies often have these scripts host-gated, so check the active plugins, not only the
  network log. A yes becomes `--delay=<handle prefixes>` (the tags' script handles).

Nothing else is asked. The names are derived (above) and stated in the report; the features are on
by default and the owner can uncheck any of them in Settings > Page Speed.

## 3. The site plugin

```sh
python3 scaffold_plugin.py "$PLUGIN" --name="<Brand> Page Speed" --site="<Brand>" --theme=$THEME --prefix=<pfx>ps \
  --hints="$WORK/hints-pages.json,$WORK/hints-posts.json" --photos="$WORK/photos-pages.json,$WORK/photos-posts.json" \
  [--keep-poster=<the first-screen video's class>] [--delay=<handles>]
python3 "$PLUGIN/bin/variants.py"
```

Then check `PLUGIN/includes/site.php` against Lighthouse, and edit it:
- Lighthouse's LCP element is the truth for the score. If it differs from the probe's at a width,
  add it too, or drop the probe's media condition. The Play Method: the probe saw the logo above
  900 px, Lighthouse the hero video. Two preloads are fine; a missing one is not.
- Media ranges: align the probe's `(max-width: Npx)` with the design's real breakpoints (inventory
  breakpoints in `REPO/.reblock/inventory.json`).
- Text LCPs need no image preload; their font must be in the page's fonts.
- Fonts: the latin-subset files of the first screen, at most 3 per page. Every preload competes with
  the LCP. A font is every-page only if every page's first screen uses it. The scaffold keeps a
  posts-only probe's fonts on the posts. A site-wide Cormorant preload made The Play Method's Book
  (Jost only) 20 KB heavier and its LCP 0.1 s slower.
- `post`: the single template's image class, or `[ 'featured' => true ]`.
- `sizes` come measured; check one against the design's columns if it looks odd. A photo with no
  sizes for a page is left alone there.
- `keep_poster`: the class of the video in the first screen, or '' (each page's first video).

`git init -b main && git add -A && git commit -m "<Name> 1.0.0 (/speed_site)"` in PLUGIN.

## 4. Plugin and cache

```sh
sh sync_plugin.sh $DEV_URL "$PLUGIN" && wp plugin activate <BRAND>-page-speed
sh wpfc.sh $DEV_URL on "$WORK/backup"
```

## 5. Verify (definition of done)

```sh
node "$PLUGIN/bin/check.mjs" $DEV_URL / /about/ <every page path> <a post path>   # "page speed checks ok"
node ../reblock_site/shots.mjs "$WORK/pages.json" site "$WORK/shots" --tag=after --mask-videos
python3 ../reblock_site/compare.py "$WORK/shots" --pair=before,after --diff         # see below
node ../reblock_site/sitecheck.mjs "$WORK/pages.json" site                          # "all checks ok"
node lh.mjs "$WORK/pages.json" "$WORK/lh-after" --compare="$WORK/lh-before"
```

- Pixels:
  - 0 differ outside the photos that now come from copies. Inside them, a few levels of resampling.
    Check the box of the differing pixels against the photo's rect, put the before/after crops side by
    side, and say so in the report.
  - Videos are masked in the shots (`--mask-videos`): headless Chrome paints the same video a few
    frames apart between runs.
- Scores:
  - The phone median must not drop on any page, and the render-blocking count should be 0.
  - Server response from the cache should be ~10 ms.
  - Dev has no network latency and no third-party tags, so production gains more.
  - Compare against the same state: a "before" from another configuration (an older plugin, other
    fonts) makes a false gain or loss.
- Lighthouse's image-delivery insight compares a photo with its CSS size and ignores the screen's
  density: a 720 px copy for a 372 px place on a 1.75x phone is right, though flagged. Copies smaller
  than size × density look soft on real phones; do not chase that flag.
- With delayed tags, check.mjs scrolls and checks they ran. Use a normal Chrome UA when checking a
  tag's own requests: Meta's pixel sends nothing under HeadlessChrome. Scripts that wait for `load` or
  `DOMContentLoaded` miss those events when held back.

## 6. Record and report

- PLUGIN: commit what the run changed. Never push without the owner's order.
- `REPO/.reblock/speed.md`: the before/after table (phone and desktop medians), the plugin and its
  version, the WP Fastest Cache settings, and the rollback. Commit it in REPO.
- Report:
  - the before → after table per page;
  - what each feature did on this site, and the names (plugin, prefix, repo);
  - what Lighthouse still flags and why;
  - the production steps (below) and the rollback.

## Production (only on Pedro's order; never from this skill)

Done this way for theplaymethod.ozonegroup.co on 2026-10-07. The records are in
`~/Sites/push_page_backups/prod-theplaymethod-before-speed-20261007-1328/` (theme, WP Fastest Cache)
and `prod-theplaymethod-site-plugin-20261007-1505/` (the site plugin).
- **GitHub:** `gh repo create peterconsuegra/<BRAND>-page-speed --private --source "$PLUGIN" --push`,
  then tag `v<Version>` and push the tag.
- **Before anything changes:**
  - production "before" evidence: `shots.mjs` with a pages file whose `site` is the production URL
    (`--mask-videos`), and PageSpeed Insights (below);
  - a `/root/deploy/release-<site>-<what>-<ts>/` folder on the server with the database
    (`wp db export - --skip-ssl`), `.htaccess`, the plugin list and the options, and a copy on the
    Mac. The WP-CLI charset warning about TLS comes from its pre-check: the dump still completes.
    Check that it ends with "Dump completed".
- **The plugin, from git, never file copies:**
  - Bundle it with HEAD: `git bundle create x.bundle HEAD main v<Version>`, then scp it to the
    release folder.
  - Clone it in the container beside the live folder, without bin/: `git clone --no-checkout x.bundle
    <plugins>/<slug>.new`, `git -c safe.directory='*' sparse-checkout set --no-cone '/*' '!/bin/'`,
    `git checkout main`. bin/'s tools name local paths and must not be public.
  - Then set `origin` to GitHub, `php -l`, chown -R www-data, and `mv` it into place.
  - Activate the new plugin, then deactivate any older speed plugin (in that order).
  - Then `opcache-refresh` (validate_timestamps=0 on Pete Panel production), `rm -rf
    wp-content/cache/all`, and warm the pages.
- **WP Fastest Cache**, if it's not there yet: `wp plugin install wp-fastest-cache --activate`, then
  the same settings through `wp --url=<site>/wp-cli/ eval-file <the settings script>` (the same
  `saveOption()` as `wpfc.sh`, uploaded as a file: no quoting). Its save writes the `.htaccess` rules.
- **A theme release** (when the run changed the theme): the same git route. Use a sparse checkout
  without `.reblock/`: the server blocks `.git` but not other dot-folders, and `.reblock/` was public
  for ~10 minutes on The Play Method.
- **Verify on production:**
  - `bin/check.mjs <prod URL> <paths>` and sitecheck with the production pages file;
  - shots after vs before (`--mask-videos`);
  - `bin/` returns 404 and `.git` 403;
  - PageSpeed Insights on the main pages, phone, at least twice each.
  - Write `ROLLBACK.md` into both copies of the release folder.
- Pete Panel's performance.conf gives PHP-rendered HTML a month in browsers. The "no browser
  caching of HTML" feature covers pages the cache does not serve (query strings, misses).
- WP Fastest Cache's own saved pages send `no-store`, which keeps them out of Chrome's back/forward
  cache. That is its rule, left as is.

## Reading PageSpeed Insights

- The keyless API (pagespeedonline v5) runs out of daily quota. Use the report page instead:
  1. In the built-in browser, open `https://pagespeed.web.dev/report?url=<encoded URL>&form_factor=mobile`.
  2. When the address becomes `/analysis/<site>/<id>`, load that address again.
  3. Run `psi_report.js` with the javascript tool. It returns, for both form factors:
     - score and metrics;
     - Google's observed timings;
     - long main-thread tasks;
     - each request's start and end;
     - the insights that failed.

  A transient "Unable to resolve" happens on Google's side: check the site, then run it again.
- What moves the phone score: PSI simulates. Its Speed Index is −250 + 1.4 × the OBSERVED Speed Index
  of its unthrottled run + 0.4 × a simulated one. So the moment Google's Chrome first draws the page
  decides it. Look at observed FCP vs observed load: a paint long after the load means something
  holds the drawing.
  - A slow parser-blocking script holds it: The Play Method's `site.js` took 1.1 s once on About.
    Hence the inline small scripts.
  - Google's phone runs have no GPU. A first screen with a big image (a hero poster, a lead photo)
    reached the screen ~1 s after Chrome's first rendering pass, in whole-second steps, with an idle
    main thread. Text-first pages did not. It is a lab effect worth 0-1 point. It reproduces locally
    only on cold first runs with Chrome's headless shell (Lighthouse with
    `CHROME_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell`),
    never in regular Chrome. Do not chase it in the page.
- Starting a video in the same frame as the first paint was suspected and ruled out (2026-10-07). The
  plugin still starts videos after the first paint: it costs nothing.
- Judge production by PSI, or by Lighthouse with `--throttling=devtools`. Simulated runs from the Mac
  against production show a "late paint" that real users do not get (Ozone, 2026-09-26).

## Rollback (dev or production)

- Uncheck a feature in Settings > Page Speed, or deactivate the plugin (it empties the page cache).
- `wpfc.sh <DEV_URL> off`: its `.htaccess` rules are removed and the plugin deactivated. The
  `.htaccess` copy in `WORK/backup` is the exact original.

## Dev safety and scope

- Local only: no deploy, no push. This skill installs WP Fastest Cache from wordpress.org on the
  dev site.
- Never submit forms or trigger tracking with real credentials while testing delayed tags.
- Lean (Pedro's rule): main thread, no subagents; the Lighthouse runs and the probes are the slow
  part, so run them in the background.
