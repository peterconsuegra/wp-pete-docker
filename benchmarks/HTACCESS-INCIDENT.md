# Incident: `.htaccess` truncated to 0 bytes under checkout load

**When:** 2026-07-20 23:34 UTC, on `staging.deploypete.com` (Pete Panel, 8GB Linode,
`docker-compose.prod-8ram-4cpu.yml`), during the 200 checkouts/min step of a
breaking-point sweep.

**Symptom:** Apache returned `404 Not Found` (Apache's own error page, not WordPress's)
for every pretty permalink — `/pricing/`, `/checkout/`, everything — while the cached
front page kept returning 200. The site looked half-alive from outside, and monitoring
that only checks `/` would not have noticed.

**Impact:** all non-cached pages down until `.htaccess` was regenerated. The 400/min and
800/min steps of the sweep produced garbage data (0 orders, 55 ms responses, idle CPU)
because every request was hitting an instant Apache 404.

## Root cause

WP Fastest Cache 1.4.9 rewrites the site's `.htaccess` **on every user registration and
every profile update** (`wpFastestCache.php:124-125`):

```php
add_action( 'user_register',   array($this, 'modify_htaccess_for_new_user'), 10, 1);
add_action( 'profile_update',  array($this, 'modify_htaccess_for_new_user'), 10, 1);
```

The handler (`wpFastestCache.php:2089`) is an unlocked read-modify-write:

```php
$htaccess = @file_get_contents($path.".htaccess");          // 1. read (unchecked)
if (preg_match("/Start_WPFC_Exclude_Admin_Cookie/", $htaccess)) { ... }
@file_put_contents($path.".htaccess", $htaccess);           // 2. write, NO LOCK_EX
```

Three separate defects compound:

1. **No `LOCK_EX`.** `file_put_contents` truncates the file before writing. Two concurrent
   PHP workers interleave as: A truncates → B reads and gets `""` → A writes full content
   → B writes `""`. Last writer wins, and the file is left empty.
2. **The read result is never checked.** An empty/failed read is written straight back, so
   the zero-byte state is *persisted*, not transient.
3. **It writes unconditionally**, even when the regex didn't match and nothing changed —
   so a site with no admin-cookie exclusion rules still rewrites the file on every
   registration, for no benefit.

**Confirmed empirically:** creating a single user via WP-CLI changed the `.htaccess`
mtime (23:43:24 → 23:51:52, same 523 bytes). The hook fires on ordinary registrations,
not just under load.

**Why the load test triggered it:** the checkout benchmark registers a customer per order
(`CREATE_ACCOUNT=1`, required because WooCommerce Subscriptions forbids guest checkout).
At 200 orders/min that is ~3.3 registrations/sec across 16-18 concurrent PHP-FPM workers —
enough overlap for the race to hit within two minutes.

**This is not merely a test artifact.** Any Pete-hosted store that registers customers at
checkout, or any membership site with active profile updates, runs the same race. It needs
concurrency, not a load test — a real traffic spike, a signup campaign, or a bulk import
would do it.

## Recovery

`wp rewrite flush --hard` refuses on this stack ("Regenerating a .htaccess file requires
special configuration"). What worked:

```bash
ssh -p 22 root@HOST 'docker exec -u www-data -w /var/www/html/<SITE> pete-panel-php-1 \
  wp eval "require_once ABSPATH . \"wp-admin/includes/misc.php\";
           require_once ABSPATH . \"wp-admin/includes/file.php\";
           \$GLOBALS[\"is_apache\"] = true;
           save_mod_rewrite_rules();"'
```

This restores only the `# BEGIN WordPress` block. **WP Fastest Cache's own rules are not
restored** — re-save WPFC settings in wp-admin to regenerate them. Until then, cached pages
are served by PHP instead of directly by Apache (measured: front-page TTFB 0.216s → 0.34s).

## Prevention

**Adopted fix: option 3 + 4, shipped as
[`php/mu-plugins/pete-htaccess-guard.php`](../php/mu-plugins/pete-htaccess-guard.php).**
Options 1 and 2 were ruled out: Pete Panel features depend on a writable `.htaccess`, and
the vhost template deliberately sets `AllowOverride All`. The guard leaves the file fully
writable and only removes the racy writer, with a self-heal backstop.

Verified 2026-07-20: on staging, creating a user no longer changes the `.htaccess` mtime
(it did before); on the local Docker stack, truncating the file to 0 bytes mid-request was
automatically restored on shutdown with a log line.

### 1. Serve rewrite rules from the vhost, not `.htaccess` (NOT VIABLE HERE — Pete Panel needs it writable)

Move the WordPress rewrite block (and WPFC's cache-serving rules) into the Apache vhost
template and set `AllowOverride None`. Plugin writes to `.htaccess` then become inert —
the file is never read. This kills the entire class of bug, and removes a per-request
directory-walk `stat()` for a small performance win.

Cost: WPFC's cache rules are version-specific and must be ported and re-checked on plugin
updates; Wordfence's WAF `.htaccess` edits need vhost equivalents too.

### 2. Make `.htaccess` unwritable by PHP (NOT VIABLE HERE — breaks Pete Panel writes)

```bash
docker exec pete-panel-php-1 chown root:root /var/www/html/<SITE>/.htaccess
docker exec pete-panel-php-1 chmod 444 /var/www/html/<SITE>/.htaccess
```

WPFC's writes use `@file_put_contents`, so they fail silently and the file survives intact.
Remember to unlock before any legitimate permalink or plugin change, or those will also
fail silently.

### 3. Unhook the offending action (surgical, keeps everything else working)

mu-plugin — WPFC exposes its instance as `$GLOBALS["wp_fastest_cache"]`
(`wpFastestCache.php:2743`):

```php
<?php
/** Plugin Name: Stop WPFC rewriting .htaccess on every registration */
add_action('init', function () {
    $wpfc = $GLOBALS['wp_fastest_cache'] ?? null;
    if ($wpfc) {
        remove_action('user_register',  array($wpfc, 'modify_htaccess_for_new_user'), 10);
        remove_action('profile_update', array($wpfc, 'modify_htaccess_for_new_user'), 10);
    }
}, 1);
```

Only consequence: WPFC's "exclude admin cookie" rules stop auto-updating when
administrators are added or renamed — re-save WPFC settings on those rare occasions.

### 4. Detect it regardless (cheap insurance, do this anyway)

A `.htaccess` that is 0 bytes or missing `# BEGIN WordPress` should page someone and
self-heal. Any of the above can still be defeated by another plugin; detection is the
backstop:

```bash
# cron, per site
[ -s "$SITE/.htaccess" ] && grep -q "BEGIN WordPress" "$SITE/.htaccess" || restore_and_alert
```

Note the monitoring lesson: a health check that only fetches `/` would have reported this
site as healthy throughout the outage, because the page cache kept serving it. **Check a
known non-cached path** (e.g. `/checkout/`) as well.

### 5. Report upstream

Worth filing against WP Fastest Cache: add `LOCK_EX`, verify `file_get_contents` before
writing back, skip the write when nothing changed, and prefer an atomic
write-temp-then-`rename()`. Affects 1.4.9; the code path is `modify_htaccess_for_new_user`.
