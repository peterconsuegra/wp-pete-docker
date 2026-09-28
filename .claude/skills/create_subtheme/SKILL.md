---
name: create_subtheme
description: Implement a claude.ai/design export (.zip) as a landing-page variant sub-theme of the saveaplaya-blocks theme (variants/<lpN>/) on the Pete Panel dev site, shown with ?lp=<lpN> while lp1 stays the current design. Args: ZIP LP_KEY [SITE]. Example: /create_subtheme lp3.zip lp3
---

# create_subtheme: claude.ai/design export → ?lp= variant of saveaplaya-blocks

Turns one Save a Playa design export (Home, Producto, Carrito, Checkout screens) into
`wp-content/themes/saveaplaya-blocks/variants/<LP_KEY>/`, live on the dev site at `/?lp=<LP_KEY>`.
lp1 is the current design and never gets a folder. Built and refined with Pedro on lp2
(2026-09-28): keep `variants/lp2/` open next to the export and copy its patterns.

## Arguments

- `ZIP`: path to the export; a bare name (`lp3.zip`) means
  `/Volumes/MacPro/SaveAPlaya2026/LandingPagesMachine/Landings/saveaplayaorg/<name>`.
- `LP_KEY`: `lp2` … `lp99` (never `lp1`). If `variants/<LP_KEY>/` exists, ask before replacing it.
- `SITE`: default `saveaplayablocks.petelocal.net` (folder `saveaplayablockspetelocalnet`). Not
  `saveaplayalegacy`: that site runs the old Divi theme.

## Where things live

- Theme source: git worktree `/Users/pedroconsuegra/Sites/projects/saveaplaya-blocks-theme-lp`,
  branch `lp-variants` (repo `peterconsuegra/saveaplaya-blocks-theme`). Never edit or switch the
  main working copy `/Users/pedroconsuegra/Sites/projects/saveaplaya-blocks-theme` (other work uses
  it). If the worktree is gone: `git -C …/saveaplaya-blocks-theme worktree add ../saveaplaya-blocks-theme-lp lp-variants`.
- Engine: `inc/lp-variants.php` (resolver, cookie, routing, assets, helpers) + `templates/lp-variant.html`.
- Shared: `variants/_shared/`: fonts; `lp.css` (base, `lp-m` / `lp-d`, `--lp-*` brand values);
  `lp.js` (rows, arrows, autoplay, menu, FAQ, sticky bar, galleries, video modal); `data.php`
  (shared content); `pages.css` + `pages/` (the site's other pages); `parts/` (arrows, clean-up
  videos, post card, posts row). `variants/_img/`: every design's images as WebP + `manifest.json`.
- Master image library (shared with claude.ai/design): `/Volumes/MacPro/SaveAPlaya2026/LandingPagesMachine/Imagenes`.
- Tools in this folder: `import_images.py`, `shots.mjs`, `sync_theme.sh`, `jscheck.mjs`, `rowscheck.mjs`.
- Dev container: `wp-pete-docker-php-1`, WP-CLI as `docker exec -u www-data -w /var/www/html/<folder> wp-pete-docker-php-1 wp …`.

## How the switch works (already built, do not rebuild)

`?lp=<key>` sets cookie `sap_lp` (30 days; `?lp=lp1` or an unknown key clears it); then the
cookie decides. A screen file in the variant folder replaces that screen: `home.php` (front
page), `product.php` (only the 7 pack products), `cart.php`, `checkout.php`. Missing screens
fall back to lp1. The menu's other pages (`sap_lp_page_screens()`: ¿Quiénes Somos?, Voluntarios,
Indicaciones de uso, Blog) and every blog post are drawn by the shared
`variants/_shared/pages/{about,volunteers,how-to-use,blog,post}.php` with the variant's own
`parts/header.php` and `parts/footer.php` (a variant can replace one with `pages/<screen>.php`);
without both parts those pages stay lp1's. Variant screens set `DONOTCACHEPAGE`; WP Fastest Cache
has the cookie exclusion `sap_lp` (dev set 2026-09-28), so cookie visitors never get a cached lp1
page and lp1 stays cached. On variant screens the engine dequeues the legacy (Divi-parity) CSS/JS,
block library and global styles, turns off the speed plugin's legacy-only features (hero_poster,
inline_css, content_visibility, swiper_on_demand, sticky_after_paint) and keeps its tag delay,
so every variant loads third-party tags the way lp1 does. Tracking keeps working: TikTok and GA4
key on `is_product()` and WooCommerce hooks; the add-to-cart links fire the server events.

## Pedro's standing decisions (every variant, unless he says otherwise)

Decided on lp2, 2026-09-28. The engine and shared files already do these for any variant, so only
check them:
- The site's other pages (¿Quiénes Somos?, Voluntarios, Indicaciones de uso, Blog, every post)
  in the variant's look, with each page's own text and photos, the real volunteers form (its
  "Submit" reads "Enviar") and the real posts. lp1's pages stay untouched.
- Blog text without emoji: `sap_lp_no_emoji()` on titles, excerpts and content.
- The 1-unit pack ("Desodorante natural 1 unidad", p1) shows Pedro's beach photo
  `Catalog/tubo-1-unidad-playa.jpg` as its pack thumbnail and first product photo
  (`sap_lp_packs()`, `sap_lp_pack_extras()`); a product screen builds its gallery with
  `$x['first']` first, as `variants/lp2/product.php` does, so it shows.
- Row arrows disable themselves at either end; autoplay pauses and stops as described below.
- The shared clean-up videos row (`parts/cleanups.php`) has phone arrows and autoplay.

To do while porting each design:
1. **Header with the menu on every screen**, the checkout included (lp1 shows its menu there too).
   `parts/header.php` draws the design's header plus the cart with its count
   (`WC()->cart->get_cart_contents_count()`) and a "Menú" button (`data-toggle data-menu
   aria-controls="lp-menu"`) opening `<nav id="lp-menu" hidden>` with `sap_lp_menu()` (Inicio,
   Carrito, ¿Quiénes Somos?, Voluntarios, Indicaciones de uso, Blog) and the current page marked
   `aria-current="page"`; lp.js closes it on Escape, a click outside or a link. The checkout calls
   it with `array( 'secure' => true )`: the design's lock "Pago seguro", and below 480 px the menu
   button shows only its icon so the row fits at 360 px. Start from `variants/lp2/parts/header.php`.
2. **Logos**: white `Logo/logo-white.svg` on dark backgrounds (the footer), forest
   `Logo/logo-forest.svg` on light ones. Check both render in color: an SVG from the export has lost
   its `<style>` and renders black (see step 3).
3. **INVIMA seal**: on light backgrounds the dark green `Catalog/invima_sello_verde.png`; the gray
   `Catalog/invima_sello_sin_fondo_blanco.webp` only on dark ones.
4. **Arrows on every scroll row that overflows, on phones and desktop**: the desktop pair (`lp-d`,
   top right: the design's, or add one as on the product page's "Salva tu piel, salva la playa")
   and the same pair centred under the row for phones (`lp-m`); both `data-scroll` inside the same
   `<section>`. Use `$arrows( '', true )` as in `variants/lp2/home.php` or
   `sap_lp_part( 'parts/arrows', array( 'phone' => true ) )`. The first-screen row (the section with
   the h1) stays without, so its buy buttons stay on the first screen.
5. **Autoplay** `data-autoplay="3000"` on the home's review rows, creator reels and clean-up
   videos: one card every 3 s, back to the start after the last. Not on the first-screen row,
   product photo galleries, the product page's rows or the blog rows; ask before adding it
   elsewhere. lp.js pauses it off screen, on focus or while a finger holds it, with the tab hidden
   or a video open, stops it once the visitor moves the row (arrows, a sideways swipe or wheel)
   and skips it for reduced motion. Never pause on hover: rows are full width, so a resting mouse
   froze the very row being looked at; and a vertical page swipe over a row must not stop it.
6. **Copy**: no emoji anywhere and never the em dash character. The ingredients answer is fixed
   (`sap_lp_ingredients_answer()` + "Ver fórmula completa"). If the design uses the "Baila sin
   parar." angle, put Pedro's line under it, verbatim: "Lo creamos para la prueba más dura: una
   fiesta en la playa del Caribe hasta el amanecer. Sin aluminio, con +48 h de protección, sigue
   contigo cuando la música para."
7. **Checkout**: the design's look on WooCommerce's own checkout, the store's fields, the
   "¿Cómo supiste…?" survey off (see "Checkout and confirmation").
8. **Other pages**: the shared pages draw with the `--lp-*` values in lp.css (lp2's colors and
   Instrument Serif). If the design's palette or serif differ, redefine them in the variant's
   style.css: `.sap-lp.sap-<key> { --lp-brand: …; --lp-serif: …; }`. `parts/footer.php` is required.

## Steps

1. **Unzip** to the scratchpad. Screens are `*.dc.html` plus a `Flujo *.dc.html` listing demo
   states (`?pack=`, `?demo=1`, `?vacio=1`, `&paso=confirmacion`). Read every screen file in full:
   they are templates, not static pages: `<sc-if value="{{ x }}">`, `<sc-for list="{{ l }}" as="i">`,
   `{{ expr }}`, `onClick`, `style-hover` / `style-active`, and a
   `class Component extends DCLogic` script holding the data arrays and `renderVals()`.
2. **Reference renders**: `node shots.mjs design <export_dir> <out_dir>` (needs internet: the
   export loads React and Babel from unpkg). Writes `design-<n>-<Screen>-390/1440(-top).png`.
3. **Images**: `python3 import_images.py <export_dir> <theme_worktree>` (Pillow; if the default
   python3 lacks it, use `~/.pyenv/versions/3.12.7/bin/python3`). It only adds new images and takes
   each file from the master library (same path) when it is there, because claude.ai/design strips
   SVG `<style>` blocks (the logos came out black until 2026-09-28) and may recompress photos; it
   warns about an SVG that still has classes but no styles.
4. **Port each screen** to `variants/<key>/<screen>.php`, following `variants/lp2/` and
   "Pedro's standing decisions":
   - Keep the design's inline styles verbatim. Its state becomes shared hooks: `isMobile` /
     `isDesk` → classes `lp-m` / `lp-d` (1024 px); FAQ → `<details class="lp-faq">` (+ nested
     `lp-formula` for "Ver fórmula completa"); scroll rows `data-row` + arrows
     `data-scroll="-1|1"` (class `lp-arrow`); gallery `data-gallery`, `data-gallery-row`,
     `data-gallery-dot`, `data-gallery-step`; sticky bar `.lp-sticky` (+ `data-sticky-anchor` on
     the buy block); videos `data-embed` (+ `data-embed-kind="reel"`); cart steppers `data-qty-step`.
   - Add-to-cart buttons become `<a class="lp-btn|lp-btn-ghost" rel="nofollow" href="$pack['add']">`.
   - Live data only: `sap_lp_packs()`, `sap_lp_pack_by_id()`, `sap_lp_pack_extras()`,
     `sap_lp_units_sold()`, `sap_lp_money()`. Shared content comes from `variants/_shared/data.php`
     (review rows, creator reels → Instagram embeds, clean-up videos → YouTube with Spanish
     captions, cause photos, FAQs with the fixed ingredients answer, steps, legal links, menu). A
     design that adds shared content extends `data.php`. Never hardcode prices, counts or links.
   - Images only through `sap_lp_img( 'Folder/file.ext', array( 'alt' => …, 'style' => …, 'loading' => 'eager'|'lazy', 'thumb' => true ) )`
     with the design's path minus `Imagenes/`; first-screen images `eager`; pack thumbnails `thumb`.
   - Root `<div class="sap-lp sap-<key>">`, `header` / `main` / `footer` landmarks; parts reused
     across screens go in `variants/<key>/parts/` and load with `sap_lp_part( 'parts/x', $args )`
     (a part missing there comes from `variants/_shared/parts/`).
   - `cart.php` keeps WooCommerce's cart handling (see `variants/lp2/cart.php`): nonce
     `woocommerce-cart`, `update_cart`, `apply_coupon`, `wc_get_cart_remove_url()`, and no
     `woocommerce-cart-form` class (WooCommerce's cart.js would replace the markup).
   - `variant.json`: name, idea, source zip, prompt file.
5. **Sync**: `sync_theme.sh <theme_worktree>` (copies functions.php, inc, templates, variants;
   lints every PHP file).
6. **Verify** (definition of done):
   - `curl` `/?lp=<key>`: 200, `class="sap-lp sap-<key>"`, `Set-Cookie: sap_lp=<key>`, no
     `legacy-*.css`, no PHP errors. `/` without cookie is still lp1 (and served from cache); with
     `-b sap_lp=<key>` it is the variant.
   - The add-to-cart link returns 302 to `/carrito/` with the pack; quantity update and "Eliminar" work.
   - `node shots.mjs site "<url>" <out_dir> site-<screen>` for the home, the Pack Ahorro, 1-unit
     and Empresa product pages and `/carrito/?lp=<key>&add-to-cart=29087`; compose design vs site
     side by side (PIL) at 390 and 1440 and fix every real delta. Expected deltas: the live counter
     (dev data), review rows a little taller (image sizes reserved), lazy images not yet loaded,
     the header's cart and menu (added on purpose). Shoot the other pages too:
     `/quienes-somos-2/`, `/voluntarios/`, `/indicaciones-de-uso/`, `/blog/` and a post.
   - `node jscheck.mjs <site_url> <key> all`: no console or page errors on the four screens, the
     four pages and a post (one aborted tracker request per page is expected), and the menu opens
     with its links and closes on Escape.
   - `node rowscheck.mjs <site_url> <key>`: every overflowing row has its arrow pair at 390 and
     1440 (first-screen rows excepted) and every `data-autoplay` row moves with the mouse resting
     in the middle of the screen. It must end with "all rows ok".
   - The footer logo is white and the header logo forest green (not black); the INVIMA seal reads
     on its background; no emoji in the copy.
7. **Commit** on `lp-variants` in the worktree; do not push. Production only on Pedro's order:
   dev → GitHub → prod deploy script, then add the `sap_lp` cookie exclusion in the WPFC admin on
   prod (saving there rewrites its .htaccess rules), purge WPFC and reset opcache.

## Checkout and confirmation (lp2 is the model)

Decided 2026-09-28: the design's look on WooCommerce's own checkout, with the store's fields
(Pedro chose the restyle; the "¿Cómo supiste…?" survey is off in the variants for now, lp1 keeps
it). Never replace the form: validation, gateways, fragments and tracking hooks stay WooCommerce's.
- `checkout.php` draws `sap_lp_part( 'parts/header', array( 'secure' => true ) )` and wraps
  `do_shortcode( '[woocommerce_checkout]' )`; the same screen serves the order-received view.
- `variants/<key>/woocommerce/checkout/` holds the variant's templates (`form-checkout.php`,
  `form-billing.php`, `review-order.php`, `payment.php`, `payment-method.php`, `thankyou.php`),
  applied by the engine through `wc_get_template` in the checkout context only. Start from
  `variants/lp2/woocommerce/checkout/` and change the markup, never the hooks: keep every
  `do_action`, the nonce, `#payment.woocommerce-checkout-payment`,
  `.woocommerce-checkout-review-order-table` (checkout.js replaces both by class after each update),
  `#place_order` with `data-value`, and in the thank-you template `woocommerce_before_thankyou`
  (Bold's return check), `woocommerce_thankyou_<gateway>` and `woocommerce_thankyou` (with
  `woocommerce_order_details_table` removed) plus the pending-payment wording.
- `variants/<key>/functions.php` (loaded for that variant's visitors) sets the design's labels,
  helper lines and order through `woocommerce_checkout_fields` AND the CO entry of
  `woocommerce_get_country_locale` at priority 1000 (WooCommerce's address script re-applies
  locale labels/priorities in the browser; the cities plugin sets "Ciudad" at 999). It also drops
  `utm_answer`, and formats carrier prices with `sap_lp_money()`.
- Gotchas: put the radio inside the gateway label (Bold's script rewrites `label[for="payment_method_bold_co"]`
  and loads an icon slider from its CDN); hide Bold's `payment_box` promo (no fields) with CSS; use
  `#payment` in selectors to outrank WooCommerce's and Bold's CSS; WooCommerce shows field
  descriptions as blue tooltips unless overridden with `!important`; the country field (Colombia only)
  is hidden, its value still posts.
- Verify with AJAX, never by paying: `?wc-ajax=update_order_review` (nonce from `wc_checkout_params`,
  pick `shipping_method[0]=flat_rate:8`) must return the variant's fragments with the new total, and
  `?wc-ajax=checkout` with empty fields must fail with the design's labels in the errors. The order
  received view can only be checked with an unknown order (generic branch): no test orders on dev.

## Dev safety

- Never submit the checkout or the volunteers form on dev: live Bold/Wompi keys and live WATI/SMTP
  credentials. Never type a phone number into the dev checkout (WATI abandoned-cart capture).
- WP-cron is off on the dev sites (`DISABLE_WP_CRON`, Pedro 2026-09-28): their databases hold WATI
  discount events with real customers' phones. Never run `wp cron event run` there, and never
  remove the constant without asking.
- Saving published posts from a script: back up first and define `WP_IMPORTING` so WordPress does
  not schedule pingbacks or update pings (see
  `/Users/pedroconsuegra/Sites/projects/wp-pete-docker/briefs/saveaplaya-posts-cleanup/clean-emoji.php`).
- Add-to-cart tests are safe: the TikTok and GA4 plugins send server events only from their live hosts.
