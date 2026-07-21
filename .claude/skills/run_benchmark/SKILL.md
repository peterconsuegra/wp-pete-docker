---
name: run_benchmark
description: Validate the published deploypete.com/benchmarks claims against a live Pete Panel server. Auto-detects the server's RAM/CPU over SSH, picks the matching tier from benchmarks/claims.json, adjusts for the load-generator's own bandwidth limits, runs the k6 cached-visits test and (gated, opt-in) the real-order checkout test, and reports a claimed-vs-measured PASS/FAIL table. Use when the user wants to benchmark, load-test, stress-test, or validate performance claims for a Pete-hosted site. Args: SITE_URL [SSH_HOST].
---

# Run Benchmark — validate published claims against a live server

Validate the claims on [deploypete.com/benchmarks](https://deploypete.com/benchmarks/)
for the Pete Panel site at **SITE_URL**, using the k6 harness in `benchmarks/`
(`claims.json`, `cached-visits.js`, `checkout-flow.js`, `compare.py`). The server tier is
**detected, never assumed** — RAM and CPU are read over SSH and mapped to a tier in
`claims.json`, and every test rate/threshold derives from that tier's claims.

**Target discipline:** the checkout leg writes real orders and customer accounts. Run it
only against staging/test sites. If SITE_URL looks like a live customer-facing store,
say so and require explicit confirmation naming the site.

## Arguments

- `SITE_URL` (required) — e.g. `staging.deploypete.com`. Domain → `DOMAIN`.
- `SSH_HOST` (optional) — defaults to `root@DOMAIN`. SSH key auth only. Beware stale
  `~/.ssh/config` entries (a wrong `Port` line shows as connection-refused — try `-p 22`
  explicitly before declaring the host unreachable).

Derive — never ask:
- Site folder `/var/www/html/<DOMAIN minus dots>`; containers `pete-panel-{php,redis,db}-1`.
- Harness lives in this repo under `benchmarks/`; results go to `benchmarks/results/`.
- `RUN_TAG`: unique per run (e.g. `bm<HHMM>`), so test emails/accounts never collide
  across runs.

## Procedure

1. **Preflight.** `k6` installed locally (`brew install k6`); `ssh <SSH_HOST> true`
   works; `curl -sI https://DOMAIN` → 200. Any failure → report and stop.

2. **Detect the server tier.** Over SSH:
   `nproc` and `free -m | awk '/^Mem:/{print $2}'`.
   Round MB up to the nearest of {8, 16, 32} GB (an "8GB" VPS reports ~7941 MB).
   Map `(ram, cpu)` → claims.json tier: 8+4 → `8ram-4cpu`, 16+4 → `16ram-4cpu`,
   32+8 → `32ram-8cpu`. A 16GB/6CPU box maps to the `16ram-6cpu` compose profile,
   which has **no published claims** — report that and stop rather than inventing
   numbers. Any other combo: report the actual size and ask which tier's claims apply.
   Also record for the report: php-container CPU cap (`docker inspect pete-panel-php-1
   --format '{{.HostConfig.NanoCpus}}'`) and `pm.max_children` — they explain ceilings.

3. **Confirm scope.** Tell the user the detected tier and what each leg does, then ask
   which to run:
   - **Cached-visits leg** — read-only GET/HEAD traffic. Safe anywhere.
   - **Checkout leg** — creates real pending orders and customer accounts at the tier's
     claimed rate ×5 min. Staging only; needs explicit yes.

4. **Client bandwidth probe (before the cached leg).** The claimed visit rates require
   real bandwidth (tier rate × compressed page size). Measure the page
   (`curl --compressed -w '%{size_download}'`) and the pipe (a burst of ~30 parallel
   compressed curls, aggregate req/s). If the pipe cannot carry the target rate with
   ~30% headroom, run the **split test** instead of a doomed full test:
   - `METHOD=HEAD` at the full claimed rate (bandwidth-free; proves request handling)
   - `METHOD=GET` at ~70% of measured pipe capacity (proves real pages serve correctly)
   Report which mode ran and why. **Never report a client-bandwidth-bound run as a
   server FAIL** — from a typical Mac (~30 req/s of full pages), the full test only
   works from a well-connected VM.

5. **Cached-visits leg.** Derive rate = `cached_visits_month / 2,592,000` (use the high
   bound), thresholds from the tier's `avg_page_load_s`. Run `benchmarks/cached-visits.js`
   (or the split pair) for 2m with `--summary-export` into `benchmarks/results/`.

6. **Checkout leg (only with explicit yes).** In order:
   a. **Blackhole outbound mail first.** Registration emails go through the site's real
      SMTP (SendGrid et al.) to bouncing addresses — reputation damage. Install a
      temporary mu-plugin: `add_filter('pre_wp_mail', '__return_true', PHP_INT_MAX);`
      and verify with `wp eval 'var_dump(wp_mail("x@example.com","t","b"));'` → true
      without sending.
   b. **Check the .htaccess guard.** If `pete-htaccess-guard.php` is not in the site's
      `mu-plugins/`, install it from `php/mu-plugins/`. WP Fastest Cache ≤1.4.9 rewrites
      `.htaccess` on every `user_register` with an unlocked read-modify-write; at a few
      registrations/sec it races to a 0-byte file and every permalink 404s.
   c. **Discover the purchase flow — don't assume.** Fetch the checkout page; find the
      gateway ids (`payment_method_*`). Try `?wc-ajax=add_to_cart` with a product; if the
      site uses a custom plan form (deploypete: POST `plan=pro_plan` to `/pricing/` →
      303), use `CART_MODE=plan_form`. Probe one manual checkout with curl; if it fails
      on `account_password`, registration is forced → `CREATE_ACCOUNT=1`.
   d. **Smoke, then measure.** 5 orders/min × 1m must succeed cleanly before the real
      run at the tier's `checkouts_per_min` × 5m via `benchmarks/checkout-flow.js`.
   e. **Restore mail.** Delete the blackhole mu-plugin; verify `has_filter('pre_wp_mail')`
      is gone. Never leave a site silently eating real email.

7. **Health-check between and after legs — with cache busters.** A page cache serves
   stale 200s while PHP is on fire; `wp` CLI runs without OPcache and can see config web
   requests can't. So: `curl "https://DOMAIN/?nocache=<random>"` must be 200, `.htaccess`
   must be non-empty and contain `BEGIN WordPress`, and
   `docker logs pete-panel-php-1 --since 5m` must be free of fresh fatals/RedisException.
   If a leg broke the site, everything measured after the breakage is invalid — fix
   first, rerun the leg.

8. **Report.** Run `benchmarks/compare.py` for the tier and echo its table. State per
   metric: claimed, measured, PASS/FAIL. Then the caveats that make it honest: test mode
   (full vs split), load-generator location, order failures attributable to pre-existing
   WAF rules (~1% ModSecurity 403s on checkout POSTs are a known false-positive — count
   them separately from capacity failures). Finish with cleanup commands:
   test orders `wp post list --post_type=shop_order --post_status=wc-pending --format=ids`
   (delete after review) and users `wp user list --search='bench+<RUN_TAG>*' --format=ids`.

## Rules (learned the hard way)

1. **Detect, don't trust labels.** Tier comes from `nproc` + `free -m` on the actual box,
   rounded up. The php container's CPU cap and `pm.max_children` bound checkout
   throughput — report them alongside results.
2. **The load generator is part of the experiment.** A residential/Wi-Fi Mac caps at
   ~25–30 req/s of full pages regardless of server speed. Probe the pipe first; use the
   split test when it's thin; say so in the report.
3. **`Accept-Encoding: gzip` on every GET, never on HEAD.** Browsers compress (4× less
   bandwidth); k6 errors decompressing HEAD's empty body.
4. **Mail blackhole before any registration-generating load**, removed and verified
   after. One forgotten run = hundreds of bounces through the customer's real SMTP.
5. **Site health checks must bypass the page cache.** Cache-busted URL + `.htaccess`
   content + container logs. A green front page proves nothing.
6. **wp-config edits need an FPM reload** (`docker exec pete-panel-php-1 kill -USR2 1`)
   — prod runs `opcache.validate_timestamps=0`, so web PHP keeps executing old bytecode
   while WP-CLI happily sees the new file.
7. **One leg at a time, verify between.** In the breaking-point sweep the site died at
   step 3 and steps 4–5 measured Apache 404s at 55ms — beautiful-looking garbage.
8. **No claims entry → no verdict.** Report what was measured; never extrapolate a
   PASS/FAIL against numbers that were never published.
