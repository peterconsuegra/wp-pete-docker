---
name: push_page
description: Push a single WordPress page from a local Pete Panel dev site to a remote production/staging Pete Panel site — content, title, and referenced media only. Idempotent (updates in place by slug), backs up the target page before overwriting, transports everything over SSH. Use when the user wants to deploy, push, promote, or sync one page from dev to prod/staging. One page only — never a whole site, theme, or plugin. Args: SRC_URL DEST_URL [SSH_HOST].
---

# Push Page — Dev → Production (single page)

Push the page at **SRC_URL** (a local Pete Panel dev site, e.g.
`deploypete.petelocal.net/my-new-page`) to **DEST_URL** (a remote Pete Panel site, e.g.
`staging.deploypete.com/my-new-page`). Copies the page's content, title, status, page
template meta, and the media files its content references. Nothing else.

**Scope: exactly one page.** Never push themes, plugins, options, menus, or other pages.
If the page depends on a theme/pattern that doesn't exist on the target, report that and
stop — pushing the theme is a separate, deliberate act.

## Arguments

- `SRC_URL` (required) — local dev page. Domain → `SRC_DOMAIN`; path → `SRC_SLUG`.
  Empty path = the site's front page (resolve the actual slug via
  `wp option get page_on_front` → `wp post get <ID> --field=post_name`).
- `DEST_URL` (required) — remote target. Domain → `DEST_DOMAIN`; path → `DEST_SLUG`
  (empty path = reuse `SRC_SLUG`).
- `SSH_HOST` (optional) — defaults to `root@DEST_DOMAIN`. The user confirmed SSH key auth
  works from this Mac; never handle passwords. If the connection fails, ask for the right
  host/user instead of retrying blindly.

Derive — never ask:
- Local site folder: `SRC_DOMAIN` minus dots under `/var/www/html/`
  (`deploypete.petelocal.net` → `/var/www/html/deploypetepetelocalnet`).
- Remote site folder: same convention from `DEST_DOMAIN`.
- Local container: `wp-pete-docker-php-1`. Remote container: `pete-panel-php-1`.
- Backup dir: `/Users/pedroconsuegra/Sites/push_page_backups/` (create if missing).

WP-CLI invocations:
- Local: `docker exec -u www-data -w /var/www/html/<SRC_FOLDER> wp-pete-docker-php-1 wp <cmd>`
- Remote: `ssh <SSH_HOST> "docker exec -u www-data -w /var/www/html/<DEST_FOLDER> pete-panel-php-1 wp <cmd>"`
  (add `-i` to docker exec whenever piping stdin through)

## Procedure

1. **Preflight.** Verify the local site folder exists in the container and the page slug
   resolves (`wp post list --post_type=page --name=<SRC_SLUG> --field=ID`); verify
   `ssh <SSH_HOST> true` succeeds and the remote site folder exists. Any failure → report
   and stop.

2. **Export source page.** Capture `post_title`, `post_status`, `post_content` (content to
   a temp file via `--field=post_content`), and `_wp_page_template` meta if set.

3. **Rewrite domains** in the content file: `http://SRC_DOMAIN` and `https://SRC_DOMAIN`
   → `https://DEST_DOMAIN`. Nothing else — no other string surgery.

4. **Backup the target (always, before any write).** If a page with `DEST_SLUG` exists
   remotely, save its current `post_content` to
   `push_page_backups/<DEST_DOMAIN>-<DEST_SLUG>-<timestamp>.html` locally, and note its
   post ID. This makes every push reversible.

5. **Confirm overwrite.** If the target page exists, tell the user what will be replaced
   (target URL + backup file path) and get a yes before writing. A brand-new page needs no
   confirmation.

6. **Push content.** Existing page:
   `cat content.html | ssh <SSH_HOST> "docker exec -i -u www-data -w <dir> pete-panel-php-1 wp post update <ID> - --post_title=..."`
   (`wp post update <ID> -` reads post_content from stdin — avoids all quoting issues).
   New page: same pattern with
   `wp post create - --post_type=page --post_name=<DEST_SLUG> --post_title=... --post_status=publish`.
   Apply `_wp_page_template` meta afterward if the source had it.

7. **Push referenced media.** Grep the (rewritten) content for
   `wp-content/uploads/[^"'\s)]+` paths, dedupe, URL-decode. Stream them in one pipeline —
   no temp copies on either host:
   `docker exec -w /var/www/html/<SRC_FOLDER> wp-pete-docker-php-1 tar -cf - <paths…> | ssh <SSH_HOST> "docker exec -i -u www-data -w /var/www/html/<DEST_FOLDER> pete-panel-php-1 tar -xf -"`
   Paths are preserved exactly, so the domain-rewritten URLs resolve with no further work.
   (Media library rows are intentionally not created — display is what matters for a
   pushed page. Note this to the user.)

8. **Flush + verify.** Remotely run `wp cache flush` and `wp rewrite flush` (harmless if
   redundant). Then `curl -sI https://DEST_URL` must return 200, and
   `curl -s https://DEST_URL` must contain the page title and at least one pushed image
   path (when media was pushed). Report pass/fail per check — never claim success without
   the curl evidence.

9. **Report.** Final message: target URL, created vs updated, number of media files
   pushed, backup file path, and the exact rollback command:
   `cat <backup>.html | ssh <SSH_HOST> "docker exec -i -u www-data -w <dir> pete-panel-php-1 wp post update <ID> -"`

## Rules (learned the hard way)

1. **Never `wp import`/WXR here.** The dev site isn't publicly reachable, so attachment
   fetching fails, and import duplicates slugs (`my-page-2`) instead of updating.
2. **Update in place, keyed by slug.** Re-running the skill must be idempotent — same
   slug, same page, new content.
3. **No secrets in commands or output.** SSH key auth only; never echo tokens, never pass
   DB credentials; production DB creds never leave the server.
4. **Backup before overwrite is non-negotiable** — it's what makes step 5's confirmation
   honest.
5. **Domain rewrite covers both schemes.** Dev is `http://`, prod is `https://`; missing
   the `http://` variant leaves mixed-content image URLs that browsers block.
6. **Escape/quote titles** when passing `--post_title` through ssh + docker exec (two
   layers of shell). Prefer single-quoting with `'\''` escaping, and keep the content on
   stdin where no escaping is needed.
7. **If the target renders unstyled**, the page depends on a theme/patterns not present on
   the target. Say so explicitly and stop — do not silently push theme files.
