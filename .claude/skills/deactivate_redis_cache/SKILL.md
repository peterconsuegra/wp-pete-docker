---
name: deactivate_redis_cache
description: Cleanly deactivate the Redis object cache for one WordPress site on a remote production/staging Pete Panel server — removes the object-cache drop-in atomically, deactivates the redis-cache plugin, strips the WP_REDIS_* constants (with the required FPM reload), and deletes only that site's keys from the shared Redis. Idempotent and reversible (wp-config backed up; re-enable via /activate_redis_cache). Use when the user wants to disable, remove, or turn off Redis / object caching for a site. One site per run. Args: SITE_URL [SSH_HOST].
---

# Deactivate Redis Cache — production Pete Panel site

Cleanly undo what `/activate_redis_cache` set up for the site at **SITE_URL**. The Redis
*server* keeps running (other sites on the box may use it) — this only unwires one site.

**Scope: exactly one site.** Never touch the Redis service, other sites' keys, or other
caching layers (WP Fastest Cache stays as-is).

## Arguments

- `SITE_URL` (required) — e.g. `staging.deploypete.com`. Domain → `DOMAIN`.
- `SSH_HOST` (optional) — defaults to `root@DOMAIN`. SSH key auth only; try `-p 22`
  explicitly if a stale `~/.ssh/config` port refuses.

Derive — never ask:
- Site folder `/var/www/html/<DOMAIN minus dots>`; containers `pete-panel-{php,redis}-1`.
- Key prefix = site folder name + `:` (what the activate skill set as `WP_REDIS_PREFIX`).
- Backup dir `~/Sites/redis_cache_backups/`.

WP-CLI: `ssh <SSH_HOST> "docker exec -u www-data -w /var/www/html/<FOLDER> pete-panel-php-1 wp <cmd>"`

## Procedure

1. **Preflight.** `ssh <SSH_HOST> true`; site folder exists and `wp core is-installed`;
   baseline health with a **cache-busted** request:
   `curl -so /dev/null -w '%{http_code}' "https://DOMAIN/?nocache=<random>"` → 200.

2. **Idempotency check.** If `wp-content/object-cache.php` is absent AND
   `wp plugin list --name=redis-cache --field=status` is not `active` AND
   `wp config get WP_REDIS_HOST` errors → already deactivated; report and stop.
   If a drop-in exists but is NOT redis-cache's (inspect the file header), stop and
   report — another plugin owns object caching and this skill must not touch it.

3. **Backup wp-config.php** to
   `~/Sites/redis_cache_backups/<DOMAIN>-wp-config-<timestamp>.php` before any write.

4. **Confirm.** State what will change (drop-in removal, plugin deactivation, constants
   removed, site's keys deleted) and get a yes — unless the user's invocation already
   named this site and asked for deactivation explicitly.

5. **Remove the drop-in first** — `wp redis disable`. This is the atomic off-switch:
   the site falls back to WordPress's in-memory cache instantly, before anything else
   is touched. Never deactivate/delete the plugin while its drop-in is live (fatals).

6. **Deactivate the plugin.** `wp plugin deactivate redis-cache`. (Leave it installed
   unless the user asks for deletion — reactivation is then one command.)

7. **Strip the constants, then reload FPM.**
   `wp config delete WP_REDIS_HOST | WP_REDIS_PORT | WP_REDIS_PREFIX | WP_REDIS_TIMEOUT | WP_REDIS_READ_TIMEOUT`
   (each; ignore "not found" errors), then **always**:
   `ssh <SSH_HOST> "docker exec pete-panel-php-1 kill -USR2 1"`.
   Prod runs `opcache.validate_timestamps=0` — without the reload, web PHP keeps
   executing the old wp-config bytecode indefinitely.

8. **Delete only this site's keys** from the shared Redis:
   `docker exec pete-panel-redis-1 sh -c "redis-cli --scan --pattern '<FOLDER>:*' | xargs -r -n 500 redis-cli del"`
   (`-n`, not `-L` — the redis:alpine image ships BusyBox xargs, which lacks `-L`.)
   Then verify the scan returns zero keys. Note: `wp redis disable` usually flushes the
   site's keys itself, so an already-zero count here is normal — verify, don't assume. **Never `flushall`/`flushdb`** — every other
   site on the server shares this Redis.

9. **Verify — all of these, report each:**
   - cache-busted `https://DOMAIN/?nocache=<random>` → 200
   - `wp-content/object-cache.php` absent
   - `wp plugin list --name=redis-cache --field=status` → `inactive`
   - `docker logs pete-panel-php-1 --since 2m` free of fresh fatals/RedisException
   - key scan for `<FOLDER>:*` → 0

10. **Report.** What was removed, key count deleted, backup path, and the rollback:
    run `/activate_redis_cache <SITE_URL>` (or restore the wp-config backup) to re-enable.

## Rules (learned the hard way)

1. **Drop-in before plugin, always.** `wp redis disable` is atomic and instant; deleting
   or deactivating the plugin first leaves a drop-in referencing missing classes and
   fatals the site.
2. **Every wp-config edit is invisible to web PHP until FPM reloads** — OPcache runs
   with `validate_timestamps=0` in every Pete prod profile. WP-CLI seeing the change
   proves nothing about the site.
3. **Prefix-scoped deletion only.** The Redis instance is shared by every site on the
   server; `flushall` would nuke neighbors' caches. Scan-and-del on the site's prefix.
4. **Verify through cache busters.** The page cache happily serves 200s while dynamic
   requests fail; a plain front-page check proved worthless in the activation incident.
5. **Foreign drop-in means stop.** If `object-cache.php` isn't redis-cache's, another
   plugin owns it — removing it silently breaks that setup.
6. **Leave the Redis service alone.** Deactivating one site is not a mandate to touch
   `pete-panel-redis-1`, its config, or its memory settings.
