---
name: reblock_site
description: Rebuild a complete multi-page website from a site export (.zip) as a block theme on a Pete Panel dev site. Accepts a static HTML site (index.html + pages + css/js/assets, e.g. from Figma or Claude) or a claude.ai/design export (.dc.html screens). Every page becomes a template made of patterns, with the design's own CSS and JS kept verbatim, verified page by page against the design at 390 and 1440 px. Local-only, never deploys. Use when the user wants to clone, reblock or implement a whole site from an export zip. For one page from a live URL use /reblock; for a ?lp= variant of an existing site use /create_subtheme. Args: ZIP DEV_URL. Example: /reblock_site ~/OZONE/ThePlayMethod/the-play-method-site.zip http://playmethod.petelocal.net
---

# reblock_site: a site export → a block theme on a Pete Panel dev site

One run turns one export (every page in it) into a standalone block theme on ONE Pete Panel dev
site, a page at a time, home first. It uses the same approach as /create_subtheme:
- read every page in full;
- render the design first and look for its defects;
- keep the design's markup, classes and CSS verbatim;
- use live data where WordPress has it;
- put design and port side by side at 390 and 1440, and fix every real difference;
- commit locally and never deploy.

The port's reference is `blocks.md` in this folder. Read it before writing the first pattern.

## Arguments

- `ZIP`: the export. A path; for a bare name, look under the current folder, `~/Downloads`, `~/OZONE`
  and `~/SaveAPlaya2026` (`find … -maxdepth 4 -name`) and confirm the match in your first message.
- `DEV_URL`: the Pete Panel dev site, e.g. `http://playmethod.petelocal.net` (a path is ignored).

Derived, never asked:
- `SITE_FOLDER`: the host without dots, under `/var/www/html/` (`playmethodpetelocalnet`).
- `WORK`: `<scratchpad>/reblock/<zip name without .zip>/`, holding `export/`, `pages.json`,
  `inventory.json`, `shots/` and `inline/`.
- `SLUG`: `<brand>-blocks` (Pedro's convention), confirmed at the decisions gate.
- `PREFIX`: the PHP prefix, the slug without `-blocks`.
- `REPO`: `~/Sites/projects/<SLUG>-theme`, a local git repo. Its `.reblock/` keeps the run record.
- WP-CLI: `docker exec -u www-data -w /var/www/html/<SITE_FOLDER> wp-pete-docker-php-1 wp …`

## Tools

The tools are in this folder, `.claude/skills/reblock_site/`; run them from there. They use
Playwright from the ozone-design-system install (`PLAYWRIGHT_DIR` overrides it) and Pillow.

| Tool | What it does |
|---|---|
| `inventory.mjs <export> <WORK> --site=URL` | Renders every page. Prints pages, landmarks, header/footer variants per page, links and placeholders, forms, media, breakpoints, fonts, the JS hooks, external hosts, asset warnings and the README. Writes `pages.json` (the work list every tool reads) and `inventory.json`. |
| `shots.mjs <pages.json> design\|site <out> [keys] [--html]` | Full-page and first-screen PNGs at 390 and 1440. `--html` saves the rendered DOM: the markup to port for claude.ai/design templates. |
| `compare.py <shots> [prefix] [--diff]` | Design and site side by side (`*-cmp.png`), with heights. |
| `measure.mjs <pages.json> [keys] [--deep=<class>] [--shots=<dir>]` | Every landmark's position and size, design vs site, matched by class; `--deep` element by element inside one section. |
| `sitecheck.mjs <pages.json> design\|site [keys]` | Console errors, failed requests, PHP warnings, broken images, external hosts, overflow from 360 to 1600, the menu, every internal link (incl. links that silently render the front page). |
| `scaffold.py <REPO> --slug= --name= [--source= --site=]` | Starts the theme from `scaffold/`. |
| `import_assets.py <pages.json> <REPO> [--master=<dir>]` | Images to WebP, videos (made fast-start), fonts (Google Fonts self-hosted), the design's CSS → `site.css` and JS → `site.js`, `assets/manifest.json`. |
| `themecheck.py <REPO>` | Block markup the editor would reject, missing patterns/parts/assets, relative URLs, export page links. |
| `sync.sh <REPO> <DEV_URL>` | themecheck, then a whole-folder copy into the site; clears the pattern cache and WP Fastest Cache files. |

`pages.json` fields:
- `export`, `site`, `widths`;
- `landmarks`: a CSS selector for the design's sections;
- `menu`: `{ toggle, panel }`;
- `pages`: `[{ key, title, design, path }]`. A state of a page is `{ key, of, click: [selectors] }`
  (or `design` with a `?query` for claude.ai/design states). `siteClick` is used when the site needs
  other selectors.

## 0. Preflight (read only, except permalinks later)

1. `DEV_URL` must be a `*.petelocal.net` host; this skill never touches staging or production.
2. The site must exist: `docker exec wp-pete-docker-php-1 test -f /var/www/html/<SITE_FOLDER>/wp-config.php`.
   If it does not, list the sites with a `wp-config.php` and ask Pedro to create it in Pete Panel.
   This skill does not create sites.
3. Refuse `saveaplayalegacy` and `ozonelegacy` (Divi-era copies). Stop and ask before using a site
   with real work: saveaplayablocks, ozonegroup, saveaplayaco, deploypete, pedroconsuegrat7, dk2, or
   any site whose active theme is not a stock `twenty*` theme or that has more than the install's
   sample posts and pages. Activating a new theme replaces that site's look.
4. Note the site's state for the report and the rollback: active theme, `permalink_structure`,
   `show_on_front`, `page_on_front`, `blogname`, the WordPress version, `WP_DEBUG`.
5. If `REPO` exists, the run is resumed:
   - read `REPO/.reblock/progress.md`;
   - unzip again into `WORK/export` and copy `REPO/.reblock/pages.json` into `WORK` (inventory keeps
     it and updates its export path);
   - continue at the first page not verified. Skip the scaffold.

## 1. Unzip and inventory

```sh
mkdir -p "$WORK" && unzip -q "$ZIP" -d "$WORK/export"
node inventory.mjs "$WORK/export" "$WORK" --site=$DEV_URL
```

Read the whole report. The inventory is a map, not a reading: also read every page of the export
in full, plus its CSS and JS.
- For a claude.ai/design export, read the flow file and every component as /create_subtheme does
  (`sc-if`, `sc-for`, `{{ }}`, the `DCLogic` data).
- Check the brand: the export and the dev site must be the same website. If they differ, stop and
  ask.

Then edit `WORK/pages.json`:
- order: home first, then the header navigation;
- titles, and paths as the page slugs (an export folder becomes a parent page);
- `menu` (the inventory guesses it) and `landmarks`;
- the states worth checking: tabs, filters, an open accordion, a menu. Example:
  `{ "key": "book-wed", "of": "book", "click": ["[data-day=wed]"] }`.

## 2. The design first

```sh
node shots.mjs "$WORK/pages.json" design "$WORK/shots"      # add --html for claude.ai/design exports
node sitecheck.mjs "$WORK/pages.json" design
```

claude.ai/design renders need internet (React and Babel from unpkg). Look at every render at both
widths and list the design's own defects:
- overflow, broken images, console errors;
- sticky or fixed elements covering content on phones;
- placeholder copy, and header or footer variants that look accidental.

Fix them in the port and report them; never copy a defect silently, and never "fix" an intended
variant.

## 3. Decisions gate (one AskUserQuestion, only the questions that apply; wait for the answers)

- **Theme slug**: `<brand>-blocks` (recommended) or another.
- **Forms** (the export has some): front-end only, as designed (recommended until a mail provider
  is chosen) / the theme's backend `inc/forms.php` (entries in wp-admin, an email to the admin) / a
  form plugin already on the site.
- **Article lists that link nowhere** (journal, blog, news): real WordPress posts, the design's
  articles as placeholder posts (recommended) / static, as designed.
- **Font files that are not Google Fonts** (often the commercial fonts in `_ds/`): licensed for the
  web, so self-host them / open substitutes.

Not asked, always:
- copy is ported verbatim; typos are reported, not fixed (Pedro's rule on copy);
- `#` links, sample data (a timetable in the JS) and missing photos stay as designed and are listed
  in the report;
- commerce screens (cart, checkout, product) are out of scope: say so and agree the approach with
  Pedro (WooCommerce's own checkout restyled, as in /create_subtheme's profiles).

## 4. Foundation

1. Theme and repo:
   ```sh
   python3 scaffold.py "$REPO" --slug=$SLUG --name="<Brand>" --source=<zip name> --site=$DEV_URL
   git -C "$REPO" init -q && git -C "$REPO" add -A && git -C "$REPO" commit -qm "Scaffold (/reblock_site)"
   ```
2. Assets: `python3 import_assets.py "$WORK/pages.json" "$REPO"`.
   - Add `--master=<library>` for claude.ai/design exports whose SVG logos lost their `<style>`.
   - Act on every WARNING.
   - Inline `<style>`/`<script>` blocks land in `WORK/inline/`: move what applies into `pages.css` /
     `port.js`.
   - For a claude.ai/design export, the screens' inline styles become classes in
     `assets/css/pages.css`: the 1440 values, plus the design's breakpoint for the phone values. Read
     them from the `--html` renders at both widths.
3. Header and footer: `patterns/header.php` and `patterns/footer.php` hold the design's markup in
   islands.
   - Every HEADER/FOOTER VARIANT from the inventory is a PHP condition on `<PREFIX>_page_key()`.
   - Links go through `<PREFIX>_the_link()`, the current page through `<PREFIX>_current()`.
   - Keep every hook the design's JS uses (the inventory lists them).
4. Generic templates: aim port.css section 3 at the design's container and type, so posts, the
   404 page and future pages look like the site.
5. The dev site:
   - `sh sync.sh "$REPO" $DEV_URL`, then `wp theme activate $SLUG`.
   - Plain permalinks: `wp option update permalink_structure '/%postname%/' && wp rewrite flush --hard`.
   - Each page of `pages.json` that does not exist yet:
     `wp post create --post_type=page --post_status=publish --post_title='<title>' --post_name=<slug> --porcelain`
     (a child page needs `--post_parent`).
   - The home page is a page "Home", then `show_on_front=page` and `page_on_front=<id>`.
   - `blogname` / `blogdescription` from the export (brand, tagline) when they are still the
     install's.
   - `WP_DEBUG` off: turn on `WP_DEBUG`, `WP_DEBUG_LOG` and `WP_DEBUG_DISPLAY false`, and say so.
6. The run record: copy `pages.json` and `inventory.json` into `REPO/.reblock/`, and start
   `REPO/.reblock/progress.md` (one line per page: pending, or verified with the date). Commit.

## 5. Page loop (home first, then pages.json order; a page is verified before the next starts)

For each page:
1. **Port**, per blocks.md:
   - one pattern per landmark section, `patterns/<key>-<section>.php`;
   - the template, `templates/front-page.html` or `templates/page-<slug>.html`;
   - the page's states, working through the design's own JS.
   Use real data where the gate said so (posts).
2. **Sync**: `sh sync.sh "$REPO" $DEV_URL` (it stops on themecheck errors).
3. **Verify**:
   ```sh
   node measure.mjs "$WORK/pages.json" <key> <state keys>         # every landmark within 2 px, 390 and 1440
   node measure.mjs "$WORK/pages.json" <key> --deep=<class>        # inside a section that differs
   node shots.mjs "$WORK/pages.json" site "$WORK/shots" <key> <state keys>
   python3 compare.py "$WORK/shots" <key> --diff                   # then LOOK at every <key>-*-cmp.png
   node sitecheck.mjs "$WORK/pages.json" site <key>                # must end with "all checks ok"
   ```
   - Fix in the patterns or `port.css` (each rule commented), never in `site.css`; re-sync,
     re-measure.
   - Allowed deltas: dynamic content (posts, dates) and what the gate decided; name each one.
   - `wp-content/debug.log` gets nothing from the theme.
4. **Record**: mark the page in `progress.md` and commit (`git -C "$REPO" add -A && git -C "$REPO" commit -m "<Page> page"`).
5. **Checkpoint after the home page only**: send Pedro `home-390-cmp.png` and `home-1440-cmp.png`
   (SendUserFile) with one line, then go on. It is a checkpoint, not a stop.

## 6. Final pass and package

- Run measure, `sitecheck site`, shots and compare over every page and state. The links, the menu,
  overflow, posts and the 404 must all be clean. Then themecheck and a clean `debug.log`.
- Zip:
  `git -C "$REPO" archive --format=zip --prefix=$SLUG/ -o ~/Sites/cloned-themes/$SLUG-$(date +%Y%m%d).zip HEAD`.
  `.reblock` stays out of the zip.
- Update `.reblock/` (pages.json, progress.md) and commit.

## Report (the final message)

- A table, one row per page: URL, heights (design vs site at 390 and 1440), measure, sitecheck,
  verified.
- Design defects fixed in the port, deliberate deltas, and open items: placeholders, forms backend,
  bookings, font licences, Yoast titles and descriptions from the export (set them only if Yoast is
  active).
- Where everything is: REPO and its last commit, the zip, the dev URLs to open.
- The rollback: the previous theme and options from the preflight, and the pages created.

## Definition of done

- Every page and state: landmarks within 2 px at 390 and 1440, and the cmp images looked at with
  every real difference fixed.
- `sitecheck site` ends with "all checks ok", themecheck has 0 errors, the theme is committed and
  zipped.

## Dev safety and scope

- Local only: no push, no deploy. GitHub, staging and production are separate jobs, only on Pedro's
  order (his rule: dev first, he verifies).
- Never submit a form on a dev copy of a production site: live mail and WhatsApp credentials. On a
  fresh site, test a form backend with `<PREFIXUC>_FORMS_NO_MAIL` defined.
- Lean (Pedro's rule): work in the main thread, without subagents or workflows, one page at a time.
  Show results early (the home checkpoint).
- Rollback on the dev site: `wp theme activate <previous theme>`, restore the noted options, delete
  the pages the run created.
