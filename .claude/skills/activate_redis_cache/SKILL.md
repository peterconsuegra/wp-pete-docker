---
name: activate_redis_cache
description: Activate the Redis object cache for one WordPress site on a remote production/staging Pete Panel server — installs the redis-cache plugin, sets a site-unique key prefix, enables the object-cache drop-in over SSH, and verifies the site still serves. Idempotent and reversible (wp-config backed up, exact rollback commands reported). Use when the user wants to enable, activate, or turn on Redis / object caching for a production site. One site per run. Args: SITE_URL [SSH_HOST].
---

# Activate Redis Cache — production Pete Panel site

Enable the Redis **object cache** (redis-cache plugin + `object-cache.php` drop-in) for
the WordPress site at **SITE_URL** on a remote Pete Panel server. The Pete stack already
runs a `redis` service (redis:7-alpine, no password, `maxmemory-policy allkeys-lfu`);
this skill only wires one site to it.

**Scope: exactly one site.** This is object caching only — do not install page-cache
plugins, do not touch other sites, do not change the Redis server config.

## Arguments

- `SITE_URL` (required) — the production site, e.g. `staging.deploypete.com`.
  Domain → `DOMAIN`; strip any path/scheme.
- `SSH_HOST` (optional) — defaults to `root@DOMAIN`. SSH key auth only; never handle
  passwords. If the connection fails, ask for the right host instead of retrying blindly.

Derive — never ask:
- Site folder: `DOMAIN` minus dots under `/var/www/html/`
  (`staging.deploypete.com` → `/var/www/html/stagingdeploypetecom`).
- Containers on production: php = `pete-panel-php-1`, redis = `pete-panel-redis-1`.
- Redis connection from PHP: host `redis`, port `6379`, no password.
- Key prefix: the site folder name (e.g. `stagingdeploypetecom:`) — **must be unique per
  site** because every site on the server shares one Redis database.

WP-CLI invocation:
`ssh <SSH_HOST> "docker exec -u www-data -w /var/www/html/<FOLDER> pete-panel-php-1 wp <cmd>"`

## Procedure

1. **Preflight.** All of these must pass, else report and stop:
   - `ssh <SSH_HOST> true`
   - site folder exists and `wp core is-installed` succeeds in it
   - Redis answers: `ssh <SSH_HOST> "docker exec pete-panel-redis-1 redis-cli ping"` → PONG
   - baseline: `curl -sI https://DOMAIN` → 200 (record response time for comparison)

2. **Idempotency check.** `wp redis status`: if it already reports Connected **and**
   `wp config get WP_REDIS_PREFIX` returns the expected site prefix, report "already
   active" with the status output and stop. If connected but with a missing/duplicate
   prefix, treat that as a misconfiguration — continue, it will be fixed.

3. **Backup wp-config.php** before any write:
   `ssh <SSH_HOST> "docker exec ... cat /var/www/html/<FOLDER>/wp-config.php" > ~/Sites/redis_cache_backups/<DOMAIN>-wp-config-<timestamp>.php`
   (create the local dir if missing). Also note whether an `object-cache.php` drop-in
   already exists (`wp_content/object-cache.php`) — if one exists from a *different*
   plugin, stop and report; replacing someone's drop-in is not this skill's call.

4. **Confirm.** Tell the user what will change on production (plugin install/activate,
   wp-config constants, drop-in enable) and get a yes before writing anything.

5. **Install & configure** (each step idempotent):
   - `wp plugin install redis-cache --activate` (if already installed: `wp plugin activate redis-cache`)
   - `wp config set WP_REDIS_HOST redis`
   - `wp config set WP_REDIS_PORT 6379 --raw`
   - `wp config set WP_REDIS_PREFIX <FOLDER>:`
   - `wp config set WP_REDIS_TIMEOUT 1 --raw` and `wp config set WP_REDIS_READ_TIMEOUT 1 --raw`
     (fail fast to PHP's built-in cache if Redis ever stalls — never let cache outages
     take the site down)

6. **Reload PHP-FPM before enabling the drop-in** — this order is critical:
   `ssh <SSH_HOST> "docker exec pete-panel-php-1 kill -USR2 1"` (graceful reload), wait ~3s.
   Production php.ini runs `opcache.validate_timestamps=0`, so FPM keeps executing the
   **old** wp-config.php bytecode until reloaded — web requests would not see the
   WP_REDIS_* constants and the drop-in would silently connect to 127.0.0.1 and 500
   every uncached request. Reloading first means FPM already has the constants when the
   drop-in (a new file, always compiled fresh) appears.

7. **Enable the drop-in.** `wp redis enable`, then `wp cache flush`.

8. **Verify — all five, report each:**
   - `wp redis status` reports Status: Connected (and shows the prefix)
   - **cache-busted** dynamic request: `curl -so /dev/null -w '%{http_code}' "https://DOMAIN/?nocache=<random>"`
     → 200. A plain front-page curl is NOT sufficient — WP Fastest Cache serves static
     HTML that masks a 500ing PHP layer. WP-CLI's "Connected" is also not sufficient:
     CLI runs without OPcache and can see constants FPM doesn't.
   - no fresh connection errors:
     `docker logs pete-panel-php-1 -t --since 2m 2>&1 | grep RedisException` → empty
   - cache is actually being written: after `curl -s https://DOMAIN >/dev/null`, run
     `ssh <SSH_HOST> "docker exec pete-panel-redis-1 redis-cli --scan --pattern '<FOLDER>:*'" | head`
     → at least one key with the site's prefix
   - `wp plugin list --status=active` still lists redis-cache (no fatal deactivated it)

   If verification fails, **roll back immediately** (step below) and report what happened.

9. **Report.** Final message: site, what was installed/changed, `wp redis status` summary,
   evidence keys exist with the site prefix, backup file path, and the exact rollback:
   `ssh <SSH_HOST> "docker exec -u www-data -w <dir> pete-panel-php-1 wp redis disable"`
   (removes the drop-in; site falls back to default caching instantly), plus
   `wp plugin deactivate redis-cache` and the wp-config backup path for full restore.

## Rules (learned the hard way)

1. **Unique `WP_REDIS_PREFIX` per site is non-negotiable.** All sites on a Pete server
   share Redis DB 0; without distinct prefixes, sites read each other's cached options
   and transients — subtle, ugly corruption. Always set it, always verify it.
2. **Never flush all of Redis** (`redis-cli flushall`/`flushdb`) — that nukes every other
   site's cache on the server. Only `wp cache flush` (prefix-scoped by the plugin).
3. **Set the 1s timeouts.** The default blocks PHP when Redis is unreachable; with
   timeouts the plugin degrades gracefully to no-cache instead of white-screening prod.
4. **A foreign `object-cache.php` drop-in means stop**, not overwrite. Another caching
   plugin owns object caching on that site; replacing it silently breaks that setup.
5. **Rollback is `wp redis disable`, not plugin delete** — it removes the drop-in
   atomically. Deleting the plugin while its drop-in is live fatals the site.
6. **No secrets in commands or output.** SSH key auth only; Pete's Redis has no password
   by design (never exposed off the Docker network) — do not "helpfully" add one.
7. **Verify with keys, not just status.** `wp redis status` can say Connected while the
   prefix is wrong or writes go nowhere useful; the `--scan --pattern '<prefix>*'` check
   is the proof the site's cache is really landing in Redis.
8. **OPcache makes wp-config edits invisible to FPM** (`validate_timestamps=0` in every
   prod profile). Any skill step that edits wp-config.php MUST be followed by an FPM
   reload (`kill -USR2 1` in the php container) before web behavior is trusted. CLI and
   FPM literally run different bytecode until then — WP-CLI saying "Connected" proves
   nothing about the site. Learned live on staging.deploypete.com 2026-07-20: enable
   without reload → every uncached request 500'd behind a green-looking page cache.
