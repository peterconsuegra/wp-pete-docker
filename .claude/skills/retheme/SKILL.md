---
name: retheme
description: Migrate a Pete Panel WordPress site off a legacy classic theme (Genesis, Divi, custom PHP) onto a new standalone Full-Site-Editing block theme, rebuilding and verifying every page in the active main menu (homepage first) in a per-page loop, packaged as .zip. Local-only — never deploys anywhere. Use when the user wants to modernize a site's theme to Gutenberg/FSE blocks. Args: LOCAL_URL [EXPORT_DIR].
---

# Retheme — Classic Theme → Gutenberg Block Theme

Modernize the site in `/var/www/html/<SITE_FOLDER>` (Pete Panel dev site) off its legacy
classic theme onto a new standalone block theme (Full-Site Editing — `theme.json` design
tokens, block templates, block patterns).

## Arguments

Keep it to these — ask for nothing else:
- `LOCAL_URL` (required) — the site's domain as declared in Pete Panel, no scheme
  (e.g. `golfnow1.petelocal.net`); used for the Apache render check. If the user pastes a
  full URL, strip the scheme and any trailing slash.
- `EXPORT_DIR` — default `/Users/pedroconsuegra/Sites/cloned-themes/`
- `DESIGN_BRIEF` — optional freeform; if thin, the design gate (rule 2) fires

Derive — never ask:
- `SITE_FOLDER` — Pete Panel convention: the domain minus the dots, under `/var/www/html/`
  (e.g. `golfnow1.petelocal.net` → `/var/www/html/golfnow1petelocalnet`). Verify the folder
  exists in the container before proceeding; if it doesn't, list `/var/www/html/` and ask.
- Legacy theme: the currently active theme (`wp theme list --status=active`)
- New theme slug: `<brand>-blocks`, derived from the site's name

The PHP container is `wp-pete-docker-php-1`; run WP-CLI as `www-data`:
`docker exec -u www-data -w /var/www/html/<SITE_FOLDER> wp-pete-docker-php-1 wp <cmd>`

## Rules (learned the hard way)

1. **Inventory first (read-only).** Read the legacy theme's files (templates, functions, hook
   callbacks, stylesheet) and extract its design tokens (palette, fonts, section structure);
   list real content (pages, posts, menus, widgets). If real content or menus exist beyond
   starter data, ask the user how to handle them before building.
2. **Design gate.** If the brief leaves the architecture (standalone block theme vs child
   theme) or visual direction (faithful modernization vs bolder redesign) unspecified, ask one
   question with options — never pick silently.
3. **Fully self-contained:** bundle all fonts and images in `assets/` (respect font licenses —
   commercial fonts get open substitutes, noted); zero external runtime references; zero
   legacy-framework dependency (verify: no parent `Template:` header, no framework requires
   in `functions.php`).
4. **Files, not database:** every design decision lives in theme files. Never save anything in
   the Site Editor before export — Site Editor edits go to the database and will not travel
   with the `.zip`.
5. **filemtime-based stylesheet version** — redeployed CSS must never be masked by browser cache.
6. **Purge page caches and prove the change.** After activation and every redeploy, clear
   server-side page caches (e.g. `wp-content/cache/` from cache plugins) and confirm the
   fetched response actually changed — a byte-identical response means you verified a cached
   page, not your work. Audit CSS/JS-snippet plugins for dead output still targeting the old
   framework's selectors (they may print from generated files even when snippets are drafted).
7. **Map assets to sections before composing.** An image pulled from the old theme's CSS isn't
   necessarily the hero art — it may belong to a different section. Treat user screenshots as
   the assignment map for which asset goes where.
8. **Flow wrapper, constrained content.** If a template renders `post_content`, keep the
   `<main>` wrapper on flow (default) layout and put the constrained layout on the
   post-content block itself — a constrained wrapper silently boxes every `alignfull`
   section at content width.
9. **Keep the legacy theme installed but inactive** — it's the "before" state for comparison
   and the instant rollback path (`wp theme activate <legacy>`).
10. **Menu-driven page loop, homepage first.** The work list is not "the homepage" — it is
    every page the site's active main menu links to. Derive it during inventory:
    - Homepage first: resolve via `wp option get show_on_front` / `wp option get page_on_front`
      (static front page) or `/` (posts page).
    - Then the active main menu: `wp menu list --fields=term_id,name,locations` → take the menu
      assigned to the primary location (if no location is assigned, the menu whose items match
      the rendered header nav); `wp menu item list <term_id> --fields=title,type,object_id,url`.
    - Keep internal pages/posts in menu order; dedupe (the homepage often appears in the menu
      too); skip external URLs, pure `#` anchors, and non-content links. Child menu items count.
    Rebuild and verify **one page at a time in that order** — compose the page's sections,
    render-check it, fix, and only then move to the next page. A page fully verified before the
    next begins means a regression always points at the page you just touched. Pages outside
    the menu are out of scope unless the user adds them explicitly.

## Phases

1. Inventory (read-only, includes the menu-derived page list from rule 10) →
2. Design decisions (gate if needed) → 3. Foundation build (`theme.json`, header/footer parts,
shared section patterns) → 4. Page loop — for each page in the menu list, homepage first:
compose its template/patterns, then render-verify that page before advancing →
5. Final verify (full pass over every page in the list) → 6. Package (final deliverable —
the workflow ends here).

## Verification (definition of done)

Activate; `wp_is_block_theme()` true; **every page in the menu-derived list** (homepage first)
renders HTTP 200 through Apache (`curl -H "Host: <LOCAL_URL>" http://localhost/<path>` for each
menu item's path) with zero PHP errors and zero legacy-framework references in the rendered
output; all bundled assets serve 200. Report the loop's results as a per-page checklist
(page → HTTP status → verified/fixed) so coverage is auditable. Save the theme folder +
installable `.zip` to `EXPORT_DIR`.

## Scope boundary

This workflow is local-only. It ends at the packaged `.zip` in `EXPORT_DIR` — that file is
the final deliverable. Installing the theme anywhere else is outside this skill's scope.
