---
name: plugin_audit
description: Static security audit of a single WordPress plugin. Reads the plugin's PHP source, traces untrusted input from source to dangerous sink, and produces a severity-ranked report of real, exploitable findings (CSRF, missing capability checks, SQLi, XSS, file/SSRF/RCE, auth-bypass in AJAX/REST). Read-only — never modifies the plugin, DB, or site. Use when the user wants to security-review, audit, or find vulnerabilities in a WP plugin. One plugin per run. Args: PLUGIN_PATH [SSH_HOST].
---

# Plugin Audit — WordPress plugin security review

Audit the WordPress plugin at **PLUGIN_PATH** for real, exploitable security defects and
report them ranked by severity. This is **defensive, read-only static analysis** of code the
user owns or operates — never modify the plugin, run its code, touch the database, or attempt
live exploitation. The deliverable is a findings report, not a patch (offer fixes after).

## Arguments

- `PLUGIN_PATH` (required) — plugin directory, e.g.
  `/var/www/html/deploypetepetelocalnet/wp-content/plugins/pete-logic`. It's a path *inside a
  Pete Panel php container*, not on the Mac.
- `SSH_HOST` (optional) — if given, the plugin lives on a remote server; prefix container
  commands with `ssh <SSH_HOST> "…"`. Omitted = local `wp-pete-docker-php-1`.

Derive:
- Local container: `wp-pete-docker-php-1`. Remote: `pete-panel-php-1` (via SSH_HOST).
- Read files with `docker exec <container> cat <file>` (add `ssh` prefix when remote). Prefer
  reading whole files for context over grepping single lines once a file is implicated.
- Report dir: `/Users/pedroconsuegra/Sites/plugin_audits/` (create if missing). Write the
  final report to `<report-dir>/<plugin-name>-<timestamp>.md`.

## Procedure

1. **Scope.** List the plugin's PHP files and total size:
   `docker exec <c> find <PLUGIN_PATH> -name '*.php'`. Read the main plugin file's header for
   name/version. If the plugin is large (≳25 PHP files), fan out: one subagent per logical
   group of files, each returning findings in the schema below, then dedupe and verify
   centrally. Small plugins: audit inline. **If you cap coverage anywhere (skipped vendor/,
   sampled files), say so explicitly in the report — silent truncation reads as "clean".**

2. **Enumerate sinks.** Grep the source for the dangerous-sink patterns below. Each hit is a
   *candidate*, not a finding — it becomes a finding only after step 3 connects it to
   attacker-controlled input without an adequate guard.

3. **Trace source → sink for each candidate.** A finding is real only when untrusted input
   (`$_GET/$_POST/$_REQUEST/$_COOKIE/$_SERVER`, `php://input`, REST/AJAX params, webhook
   bodies) reaches the sink **and** the guard for that sink class is missing or bypassable.
   For each candidate determine: (a) is the entry point reachable by an unauthenticated or
   low-privilege user? (b) is input sanitized/validated for the sink's context? (c) for
   state-changing actions, is there a valid nonce **and** capability check? Missing (c) on a
   write is its own finding (CSRF / broken access control) even if input is clean.

4. **Verify — kill false positives.** Before reporting, adversarially challenge each finding:
   is the "untrusted" value actually hardcoded/constrained upstream? Does a shared guard
   (an `admin_init` cap check, a `check_ajax_referer` earlier in the handler) already cover
   it? Is `$wpdb->prepare` used even though the call looks raw? Only report findings you can
   state a concrete exploit path for. When unsure, mark severity **Info** and say why.

5. **Report.** Write the markdown report and also summarize in chat. Rank findings by
   severity. For each: title, severity, file:line, the vulnerable code (a few lines),
   the source→sink data flow, a concrete exploit scenario, and a specific fix. End with an
   overall risk verdict and a one-line "what to fix first."

## WordPress sink patterns to hunt (grep these)

- **SQL injection** — `$wpdb->query/get_results/get_var/get_row` with interpolated variables;
  flag any `$wpdb->` call whose SQL contains `$` and no `$wpdb->prepare()`. Also raw `mysqli_`.
- **XSS (output)** — `echo`/`print`/heredoc emitting request data without
  `esc_html/esc_attr/esc_url/wp_kses`; `_e()`/`_x()` of dynamic strings; `->innerHTML`-style
  JS built from PHP. Reflected (echoing `$_GET`) is higher severity than stored.
- **CSRF / broken access control** — `admin_post_*`, `admin-ajax` `wp_ajax_*` handlers, REST
  `register_rest_route` with `permission_callback => '__return_true'`, or form handlers that
  mutate state **without** `wp_verify_nonce`/`check_admin_referer`/`check_ajax_referer` AND
  `current_user_can`. `wp_ajax_nopriv_*` = unauthenticated reachable — scrutinize hard.
- **File inclusion / path traversal** — `include/require`, `file_get_contents`, `fopen`,
  `unlink`, `readfile`, `move_uploaded_file`, `wp_handle_upload` with request-derived paths
  or unrestricted extensions; `../` reachable in a filename.
- **SSRF** — `wp_remote_get/post`, `curl_*`, `file_get_contents('http…')` with a
  request-controlled URL.
- **RCE / dangerous eval** — `eval`, `assert`, `create_function`, `preg_replace` with `/e`,
  `call_user_func(_array)` on request data, `exec/system/shell_exec/passthru/popen/proc_open`.
- **Object injection** — `unserialize()` (or `maybe_unserialize`) on request/cookie data.
- **Auth / secrets** — hardcoded API keys, passwords, tokens; `md5`/`sha1` for passwords;
  auth decisions on spoofable headers (`X-Forwarded-For`, `REFERER`); `extract()` on request.
- **Arbitrary options / privilege** — `update_option/delete_option`, `wp_insert_user`,
  `add_role`, `->set_role` reachable with attacker-influenced keys/values.

## Rules (learned the hard way)

1. **Read-only, always.** No edits, no `wp` writes, no executing plugin code, no DB queries
   against the live site, no probing the running endpoint. Static source review only.
2. **A grep hit is not a vulnerability.** Report only findings with a traced source→sink path
   and a stated exploit. Volume of candidates ≠ findings; a report full of unverified greps is
   worse than a short accurate one.
3. **Rank honestly.** Critical = unauth RCE/SQLi/auth-bypass. High = unauth data exposure or
   authenticated RCE/SQLi. Medium = CSRF on meaningful state, stored XSS behind auth. Low =
   self-XSS, info leak. Info = defense-in-depth nits. Don't inflate to look thorough.
4. **WordPress-aware, not generic.** Credit real WP guards: `sanitize_*`, `esc_*`,
   `wp_kses`, `$wpdb->prepare`, `current_user_can`, the nonce family. Flagging code that's
   already correctly guarded destroys trust in the whole report.
5. **Third-party/vendored code**: note its presence and version, check it against known CVEs
   conceptually, but scope deep tracing to the plugin's own code unless asked otherwise.
6. **No exploit tooling.** Describe the exploit path in prose for the fix; do not write
   working exploit payloads, and do not test against any live site.

## Finding schema (for subagent fan-out / consistent reporting)

```
severity   : Critical | High | Medium | Low | Info
category   : sqli | xss | csrf | broken-access-control | file | ssrf | rce | object-injection | secrets | other
file       : path:line
code        : the vulnerable lines
data_flow  : entry point → (guards present) → sink
exploit    : concrete scenario an attacker would run
fix        : specific WP-correct remediation
```
