---
name: speed_site
description: Speed up a site built with /reblock_site for Core Web Vitals on its Pete Panel dev site. Measures every page with Lighthouse (phone and desktop) and finds each page's LCP element and first-screen fonts. Sets up the shared Reblock Page Speed plugin (inline theme CSS, LCP and font preloads, videos after the page, optional delay of tracking tags, no browser caching of HTML), writes the theme's speed.json, and turns on WP Fastest Cache. Then proves the pages are pixel-identical to before, every feature works and the scores moved. Local-only; never deploys. Run after /reblock_site. Args: DEV_URL. Example: /speed_site http://playmethod.petelocal.net
---

# speed_site: Core Web Vitals for a /reblock_site site

Runs after `/reblock_site` on the same dev site. Three pieces, all verified:
1. **WP Fastest Cache**: Apache serves saved pages without PHP (server response ~10 ms).
2. **Reblock Page Speed**, one plugin shared by every /reblock_site site (repo
   `~/Sites/projects/reblock-page-speed`, private GitHub `peterconsuegra/reblock-page-speed`). Settings
   > Page Speed has one checkbox per feature:
   - the theme's CSS inline;
   - the LCP image preloaded with fetchpriority;
   - first-screen fonts preloaded;
   - videos after the page;
   - third-party tags after the first interaction (off unless the owner says yes);
   - no browser caching of HTML.
3. **The theme's `speed.json`**: each page's LCP hint and fonts. It deploys with the theme, so the
   plugin stays generic. Format: the plugin's README.

The rule: the speed work never changes the look. Pages must be pixel-identical before and after.

Tested 2026-10-07 on The Play Method (playmethod.petelocal.net, WordPress 7.1.3), then rolled back:
- home on phones went 97 to 100, LCP 2.6 to 1.7 s, layout shift 0.014 to 0, server response
  129 to 8 ms, page weight 1.3 MB to 685 KB;
- render-blocking requests went from 3 to 0 on every page;
- every page and state stayed pixel-identical.

## Arguments

- `DEV_URL`: the Pete Panel dev site /reblock_site built (`http://<name>.petelocal.net`).

Derived:
- `SITE_FOLDER`: the host without dots;
- `SLUG`: the active theme (`wp option get stylesheet`);
- `REPO`: `~/Sites/projects/<SLUG>-theme` (it must have `.reblock/pages.json`);
- `PLUGIN`: `~/Sites/projects/reblock-page-speed`;
- `WORK`: `<scratchpad>/speed/<SLUG>/`.
- WP-CLI: `docker exec -u www-data -w /var/www/html/<SITE_FOLDER> wp-pete-docker-php-1 wp …`.
  Never with `--url=<a cached page>`: with WP Fastest Cache active, WP-CLI then prints that page and
  exits without running the command.

## Tools

In this folder; they reuse `/reblock_site`'s tools (`../reblock_site/`). Lighthouse lives in
`~/.cache/claude-skills/lighthouse`. If it's missing:
`mkdir -p ~/.cache/claude-skills/lighthouse && cd ~/.cache/claude-skills/lighthouse && npm init -y && npm install lighthouse`.

| Tool | What it does |
|---|---|
| `lh.mjs <pages.json> <out> [keys] [--runs=3] [--form=mobile,desktop] [--compare=<before_out>]` | Lighthouse performance, per-metric medians, LCP element, render-blocking count; before → after table. Chrome runs with HTTPS-Upgrades off (an http dev site would pay a failed https try). |
| `lcpprobe.mjs <pages.json> [keys] [--out=<file>]` | Each page's LCP element at 7 widths and the font files of the first screen. Prints a speed.json draft with class hints (a class survives content changes, e.g. a journal's lead post) and media ranges. |
| `sync_plugin.sh <DEV_URL> [plugin_dir]` | The plugin into the site (whole-folder swap, php -l, cache emptied). |
| `wpfc.sh <DEV_URL> on [backup_dir] \| status \| off` | WP Fastest Cache through its own `saveOption()` (same `.htaccess` rules as a save in wp-admin). `on` keeps a copy of `.htaccess` in backup_dir, never in the web root, and proves home comes from the cache by Apache. |
| `speedcheck.mjs <pages.json> [keys]` | Per page: served from the cache without PHP, no-cache on PHP-rendered HTML, no theme stylesheet links, preloads present and used (Chrome warns about unused ones), videos idle until load then playing, no console errors. Ends with "speed checks ok". |
| `../reblock_site/shots.mjs … --tag=before\|after` + `compare.py --pair=before,after --diff` | Pixel proof that nothing moved. |
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
2. Check that `PLUGIN` exists (if not, clone it from GitHub) and that Lighthouse is installed.
3. Note the site's state for the rollback: active plugins, `WpFastestCache` option, a copy of
   `.htaccess` (`wpfc.sh on` makes it), the `reblock_page_speed` option.
4. Permalinks must not be plain: /reblock_site sets them, and WP Fastest Cache refuses plain ones.

## 1. Baseline (before anything changes)

```sh
mkdir -p "$WORK" && cp "$REPO/.reblock/pages.json" "$WORK/"       # set "site" to DEV_URL if it differs
node lh.mjs "$WORK/pages.json" "$WORK/lh-before"                    # 3 runs, phone and desktop
node ../reblock_site/shots.mjs "$WORK/pages.json" site "$WORK/shots" --tag=before --mask-videos
node lcpprobe.mjs "$WORK/pages.json" --out="$WORK/speed.json"
```

Also probe one post and the posts pages, if the site has posts. Make a second pages file whose
entries use the plugin's page keys: `post` for a single post (path = a real post), and the archive
paths. Run `lcpprobe.mjs` on it as well.

Read the Lighthouse table. Note each page's LCP element, the render-blocking requests, and what the
insights flag (image delivery, LCP discovery, font chains).

## 2. Decisions (ask only when it applies)

- **Third-party tags.** If the site loads tracking or chat scripts, ask the owner:
  - start them after the first interaction (better scores and INP; visitors who leave within 10 s
    without touching the page are not counted), or
  - keep them immediate (the default).

  Dev copies often have these scripts host-gated, so check the active plugins, not only the
  network log.

Nothing else is asked. The other features are on by default; the owner can uncheck any of them in
Settings > Page Speed.

## 3. speed.json (in REPO, deployed with the theme)

Start from the probe's draft, then check it against Lighthouse:
- Lighthouse's LCP element is the truth for the score. If it differs from the probe's at a width,
  add it too: the hero video at desktop while the probe saw the logo. Two preloads are fine; a
  missing one is not.
- Media ranges: align the probe's `(max-width: Npx)` with the design's real breakpoint (inventory
  breakpoints in `REPO/.reblock/inventory.json`).
- Text LCPs need no image preload; their font must be in `fonts`.
- `fonts`: the latin-subset files of the first screen, at most 3 per page. Every preload competes
  with the LCP. A font goes in the top-level `fonts` only if every page's first screen uses it;
  otherwise it goes in those pages' `fonts`. A site-wide Cormorant preload made The Play Method's
  Book (Jost only) 20 KB heavier and its LCP 0.1 s slower.
- `post`: `{ "class": "<the single template's image wrapper>" }`, or `{ "featured": true }`.
- `delay`: extra script handle prefixes, only when the gate said so.

Copy it to `REPO/speed.json`, then `sh ../reblock_site/sync.sh "$REPO" $DEV_URL`.

## 4. Plugin and cache

```sh
sh sync_plugin.sh $DEV_URL && wp plugin activate reblock-page-speed     # defaults: all on, delay_tags off
wp option update reblock_page_speed '{"delay_tags":1}' --format=json      # only if the gate said yes
sh wpfc.sh $DEV_URL on "$WORK/backup"
```

## 5. Verify (definition of done)

```sh
node speedcheck.mjs "$WORK/pages.json"                                              # "speed checks ok"
node ../reblock_site/shots.mjs "$WORK/pages.json" site "$WORK/shots" --tag=after --mask-videos
python3 ../reblock_site/compare.py "$WORK/shots" --pair=before,after --diff         # 0 px differ everywhere
node ../reblock_site/sitecheck.mjs "$WORK/pages.json" site                          # "all checks ok"
node lh.mjs "$WORK/pages.json" "$WORK/lh-after" --compare="$WORK/lh-before"
```

- Pixels:
  - 0 differ is the target. A difference must be explained or fixed (look at the cmp image).
  - Videos: the shot step waits until every autoplaying video has data (a late loader included),
    then seeks it to its first frame. A poster-vs-frame difference means a video did not load;
    speedcheck says which. Before 2026-10-07 the wait missed late-attached files, and the first
    shots after setup caught the poster (The Play Method, home at 1440).
  - A deliberate image change (a srcset candidate) differs by a few levels inside that image only.
    Check the box of the differing pixels against the image's rect, and say so in the report.
- Scores:
  - The phone median must not drop on any page, and the render-blocking count should be 0.
  - Server response from the cache should be ~10 ms.
  - Dev has no network latency and no third-party tags, so production gains more.
- What Lighthouse still flags goes back into the theme, not the plugin. Example: image delivery
  for a big LCP photo means a `srcset` in the pattern (`wp_get_attachment_image_srcset()` for
  media-library images, smaller theme asset variants for the export's). Its `sizes` come from the
  design's column widths and gutters. The plugin (1.0.1+) preloads a "class" LCP image with that
  same srcset (`imagesrcset`), so speed.json does not change. Then re-run step 5.
  - The Play Method's Journal lead photo: 1400 px / 110 KB became 768 px / 46 KB on phones and
    desktop.
- With delayed tags, check that they start after a scroll. Use a normal Chrome UA: Meta's pixel
  sends nothing under HeadlessChrome. Also check scripts that wait for `load` or
  `DOMContentLoaded`: those events are over when a held-back script starts.

## 6. Record and report

- Commit `speed.json` in REPO. Write `REPO/.reblock/speed.md`: the before/after table (phone and
  desktop medians), the settings, the WP Fastest Cache settings and the rollback.
- Commit only what the run changed in PLUGIN. Never push without the owner's order.
- Report:
  - the before → after table per page;
  - what each feature did on this site;
  - what Lighthouse still flags and why;
  - the production steps (below) and the rollback.

## Production (only on Pedro's order; never from this skill)

Done this way for theplaymethod.ozonegroup.co on 2026-10-07. The record is in
`~/Sites/push_page_backups/prod-theplaymethod-before-speed-20261007-1328/ROLLBACK.md`.
- **Before anything changes:**
  - production "before" evidence: `shots.mjs` with a pages file whose `site` is the production URL
    (`--mask-videos`), and `lh.mjs … --form=mobile --throttling=devtools`;
  - a `/root/deploy/release-<site>-<ts>/` folder on the server with the database
    (`wp db export … --skip-ssl` if the TLS error appears), a tar of the theme, `.htaccess`, the
    plugin list, and a copy on the Mac.
- **Code from git, never file copies:**
  - Tag the theme release (`v<style.css Version>`), then `git bundle create x.bundle main <tags>`
    for the theme and the plugin. scp them to the release folder.
  - In the container, `git clone` each bundle beside the live folder (`.new`), `merge --ff-only
    <tag>`, then `git branch -m master main` (a bundle without HEAD clones onto "master").
    Set `origin` to the GitHub URL.
  - **Theme: `git sparse-checkout set --no-cone "/*" "!/.reblock/"`, then `update-index
    --refresh` and `sparse-checkout reapply`.** The server blocks `.git` and dot-files but not
    `.reblock/`, which was public for ~10 minutes on The Play Method.
  - `diff -rq` the live folder against the new one: expect only this release's files.
  - Then chown -R www-data, swap with `mv` (the old folder goes out of the web root), and run
    `opcache-refresh` at once (validate_timestamps=0 on Pete Panel production).
- **Plugin:** activate it. **WP Fastest Cache:** `wp plugin install wp-fastest-cache --activate`,
  then the same settings through `wp --url=<site>/wp-cli/ eval-file <the settings script>` (the
  same `saveOption()` as `wpfc.sh`, uploaded as a file: no quoting). Then `opcache-refresh`,
  `rm -rf wp-content/cache/all`, and warm the pages.
- **Verify on production:** speedcheck and sitecheck with the production pages file, shots after
  vs before (`--mask-videos`), `lh.mjs --throttling=devtools --compare`, and curl the headers
  (`?rps-check=1` must say no-cache). Write `ROLLBACK.md` into both copies of the release folder.
- Judge production by PSI, or Lighthouse with `--throttling-method=devtools`. Simulated runs from
  the Mac against production show a "late paint" that real users do not get (Ozone, 2026-09-26).
- Pete Panel's performance.conf gives PHP-rendered HTML a month in browsers. The "no browser
  caching of HTML" feature covers pages the cache does not serve (query strings, misses).
- WP Fastest Cache's own saved pages send `no-store`, which keeps them out of Chrome's back/forward
  cache. That is its rule, left as is.

## Rollback (dev or production)

- Uncheck a feature in Settings > Page Speed, or deactivate the plugin (it empties the page cache).
- `wpfc.sh <DEV_URL> off`: its `.htaccess` rules are removed and the plugin deactivated. The
  `.htaccess` copy in `WORK/backup` is the exact original.
- `speed.json` without the plugin does nothing.

## Dev safety and scope

- Local only: no deploy, no push. This skill installs WP Fastest Cache from wordpress.org on the
  dev site.
- Never submit forms or trigger tracking with real credentials while testing delayed tags.
- Lean (Pedro's rule): main thread, no subagents; the Lighthouse runs are the slow part.
