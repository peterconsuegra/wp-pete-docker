---
name: reblock
description: Rebuild a single landing page as a Twenty Twenty-Four child block theme inside a Pete Panel dev site. Use when the user wants to clone, recreate, or take design inspiration from one specific page (any stack — WP/Divi, Shopify, Webflow, headless/Astro, static) and produce a self-contained Gutenberg block theme. One page only — never a whole site. Args: PAGE_URL DEST_URL [EXPORT_DIR].
---

# Reblock — Landing Page → Gutenberg Block Theme

Rebuild the single landing page at **PAGE_URL** as a Twenty Twenty-Four child theme with
native Gutenberg blocks — block patterns per section plus header/footer template parts —
published at **DEST_URL** on a Pete Panel dev site and exported as an installable `.zip`.

**Scope: exactly one page.** This command clones one landing page, never a whole site. If
PAGE_URL is a bare domain, that means the home page — still one page. Links on the cloned
page stay as-is or point to `#`; do not crawl or rebuild the pages behind them.

## Arguments

Two URLs (ask compactly for anything missing):
- `PAGE_URL` (required) — the landing page to clone; bare domain = its home page; deep URL =
  exactly that page
- `DEST_URL` (required) — where to publish it on the Pete Panel site, as one URL
  (e.g. `http://testing1.petelocal.net/golf-test`). Parse it:
  - **domain** → `LOCAL_URL`, the Pete Panel site (strip scheme and trailing slash)
  - **path** → `DEST_PAGE`: empty or `/` = front page; a slug like `/golf-test` = publish at
    that page, leaving the existing front page untouched
- `EXPORT_DIR` — default `/Users/pedroconsuegra/Sites/cloned-themes/`

Derive — never ask:
- `SITE_FOLDER` — Pete Panel convention: the DEST_URL domain minus the dots, under
  `/var/www/html/` (e.g. `testing1.petelocal.net` → `/var/www/html/testing1petelocalnet`).
  Verify the folder exists in the container before proceeding; if it doesn't, list
  `/var/www/html/` and ask.

The PHP container is `wp-pete-docker-php-1`; run WP-CLI as `www-data`:
`docker exec -u www-data -w /var/www/html/<SITE_FOLDER> wp-pete-docker-php-1 wp <cmd>`

## Rules (learned the hard way)

1. **Rights gate — always ask first.** Before building anything, ask the user one question
   with two options: **(a) authorized** — their own site or a client engagement with written
   authorization → bundle the source site's own images, logo, and self-hosted fonts (only where
   licenses permit; commercial fonts get an open substitute, noted); or **(b) case study** —
   no authorization → reuse only the layout structure, spacing rhythm, and openly licensed
   fonts, and generate original illustration, fictional branding, and original copy inspired by
   the source, with a footer disclaimer that it's a fictional design study. Do read-only recon
   (stack, fonts, layout) while waiting, but download or bundle nothing until answered.
2. **Identify the source stack first** (WP/Divi, Webflow, Shopify, React, headless-WP/Astro,
   static…) and adapt extraction — don't assume WordPress paths. Hashed bundles (`/_astro/`,
   `/_next/`) hide fonts and CSS; images may live on a separate origin (e.g. a headless WP
   backend, with different upload-month folders than the page suggests). If the user attaches
   a screenshot, it is the layout source of truth.
3. **Fonts: trace `@font-face` in every loaded stylesheet** (inlined and bundled too), never
   trust `<link>` tags — sites load unused kits while self-hosting the real display font.
   Google Fonts → bundle locally (Fontsource works); commercial fonts (Gotham, etc.) → never
   bundle, substitute openly (e.g. Montserrat) and say so; Adobe Fonts kits → enqueue the kit
   CSS and tell the user which domains to allowlist.
4. **Match layout, not just content:** header composition (watch inline SVG logos, sprite
   symbols like `<use href="#logo">`, and `currentColor` fills that render black inside
   `<img>` — patch fills), section structure and alignment, exact colors/gradients from
   computed CSS, button styles, CSS background images (not just `<img>` tags). Flag ambiguity
   instead of inventing.
5. **Fully self-contained:** all images, icons, and fonts in the theme's `assets/` — zero
   runtime references to the source site or its CDNs.
6. **filemtime-based stylesheet version** in `functions.php` — never let browser cache mask
   CSS changes across deploys.

## Destination

- `front page` → ship a `front-page.html` template.
- Slug (e.g. `/golf`) → register a custom template in `theme.json` (`customTemplates`) with
  `templates/page-<slug>.html`, create the WP page, assign the template, leave the existing
  front page untouched.

## Verification (definition of done)

Activate the theme; confirm `wp_is_block_theme()` is true; render the destination through
Apache (`curl -H "Host: <LOCAL_URL>" http://localhost/…`) → HTTP 200, zero PHP errors, all
key sections present; every bundled asset serves 200; patterns registered. Then save the theme
folder + installable `.zip` to `EXPORT_DIR`, give a section-by-section fidelity comparison
noting deltas (and anything deliberately not cloned, e.g. commerce features), and state the
exact URL to open.
