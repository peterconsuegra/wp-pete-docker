# Porting reference: export markup → block markup

`__SLUG__` and `__PREFIX__` stand for the theme's slug and PHP prefix (scaffold.py writes them).

Read this before writing the first pattern. Everything marked *verified* was measured equal to the
design with the scaffold's theme.json: The Play Method, 2026-10-07, on WordPress 7.0 (half the home
page) and then the whole site on 7.1.3. Every page and state came out with 0 pixels different at
390 and 1440.

## The principle

Keep the design's element, classes, ids, attributes and text, and pick the block that saves exactly
that element. The design's CSS (site.css, verbatim) then styles the port as it styles the export. Two
kinds of markup:

- **Blocks** for structure and copy someone may edit: sections and wrappers (`core/group`),
  headings, paragraphs, plain text lists, link buttons.
- **`core/html` islands** for everything a block cannot save exactly: media (`img`, `video`,
  `picture`, `svg`, `iframe`), forms, inline structures that are not blocks (`span` labels, `dl`,
  `table`, `button`), widgets driven by the design's JS (tabs, filters, sliders, toggles), and any
  element carrying `style`, `data-*`, `aria-*` (beyond `aria-label` on a link) or `role`.

A static block's wrapper may carry only its class and id. Any other attribute (style, data-, aria-,
role) makes the editor reject the block ("unexpected or invalid content"), so such an element goes in
an island, or the attribute moves to an inner element that is in one. One exception: a group's
`aria-label` is the `ariaLabel` attribute (*verified* on 7.1). A section the design names with
`aria-labelledby="x-title"` gets `ariaLabel` with that heading's text. The accessible name is the
same; list it in the report as a deliberate delta.

## Recipes (copy exactly; themecheck.py checks tag, classes and id)

Group, any tag (*verified* with section, div, ol, ul, li). `layout` is always `default`: `constrained`
adds max-width rules the design does not have.

```html
<!-- wp:group {"tagName":"section","anchor":"elements","className":"elements","ariaLabel":"Five elements","layout":{"type":"default"}} -->
<section id="elements" class="wp-block-group elements" aria-label="Five elements">
	…inner blocks…
</section>
<!-- /wp:group -->
```

A list of cards (`ol > li` holding headings and images) is groups with `tagName` `ol`/`ul` and
`li` (*verified*); `core/list` only holds inline text.

Heading (*verified*; `level` 2 is the default and is omitted):

```html
<!-- wp:heading {"level":3,"className":"element__title","anchor":"x-title"} -->
<h3 class="wp-block-heading element__title" id="x-title">Strength</h3>
<!-- /wp:heading -->
```

Paragraph (*verified*; no base class; inline `<strong>`, `<em>`, `<a>`, `<br>` are fine):

```html
<!-- wp:paragraph {"className":"hero__lede"} -->
<p class="hero__lede">The Play Method is … <strong>we grow through play.</strong></p>
<!-- /wp:paragraph -->
```

Link buttons (*verified*): the design's button classes go on the wrapper `div` via `className`.
The scaffold's theme.json makes WordPress's button element inherit everything, so the design's
`.btn` rules on the wrapper style it the same. If a design's button CSS targets `a.btn`, `.btn:focus`
or the link's own box in a way that differs, re-aim it in port.css
(`.btn > .wp-block-button__link { … }`). The `buttons` wrapper takes the design's row class.

```html
<!-- wp:buttons {"className":"hero__actions"} -->
<div class="wp-block-buttons hero__actions">
	<!-- wp:button {"className":"btn btn--solid-cream"} -->
	<div class="wp-block-button btn btn--solid-cream"><a class="wp-block-button__link wp-element-button" href="<?php __PREFIX___the_link( 'book' ); ?>">First class free</a></div>
	<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
```

Island (*verified* with video, img, h1-with-logo, form, span, header, footer):

```html
<!-- wp:html -->
<video class="hero__media" autoplay muted loop playsinline preload="metadata" poster="<?php __PREFIX___the_asset( 'assets/photos/hero.jpg' ); ?>" aria-hidden="true">
	<source src="<?php __PREFIX___the_asset( 'assets/video/hero.mp4' ); ?>" type="video/mp4">
</video>
<!-- /wp:html -->
```

Plain list of text (`ul` of short items):

```html
<!-- wp:list {"className":"facts"} -->
<ul class="wp-block-list facts"><!-- wp:list-item --><li>Ages 5 to 75</li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
```

FAQ item (`details`):

```html
<!-- wp:details {"className":"faq__item"} -->
<details class="wp-block-details faq__item"><summary>Question?</summary><!-- wp:paragraph -->
<p>Answer.</p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
```

Photo the owner may want to swap in the editor (otherwise an `img` in an island): `core/image`
adds a `figure`, so check its margins with measure.mjs and zero them in port.css if they move things.

```html
<!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"split__img"} -->
<figure class="wp-block-image size-full split__img"><img src="<?php __PREFIX___the_asset( 'assets/photos/a.jpg' ); ?>" alt="…"/></figure>
<!-- /wp:image -->
```

## Pattern files

```php
<?php
/**
 * Title: Home, five elements
 * Slug: __SLUG__/home-elements
 * Categories: __SLUG__
 * Inserter: no
 *
 * @package __SLUG__
 */

$__PREFIX___items = array( /* repeated content, from the design, in the order it shows */ );
?>
<!-- wp:group … -->
	<?php foreach ( $__PREFIX___items as $__PREFIX___i ) : ?>
	<!-- wp:group {"tagName":"li","className":"element","layout":{"type":"default"}} -->
	…<?php echo esc_html( $__PREFIX___i[0] ); ?>…
	<!-- /wp:group -->
	<?php endforeach; ?>
<!-- /wp:group -->
```

- One pattern per landmark section, `patterns/<page>-<section>.php`, slug `<theme slug>/<page>-<section>`.
  A section that repeats on several pages with different copy is one pattern per page (copy is what
  people edit); identical ones are one shared pattern.
- PHP runs on every request: loops around blocks (*verified*), page conditions (`__PREFIX___page_key()`),
  WP_Query loops for posts. In the Site Editor there is no current page.
- Prefix every global variable with the theme prefix (patterns share the global scope).
- Escape what PHP prints: `esc_html()`, `esc_attr()`, the `__PREFIX___the_*()` helpers escape.

## Templates

```html
<!-- wp:template-part {"slug":"header","tagName":"div"} /-->

<!-- wp:group {"tagName":"main","layout":{"type":"default"}} -->
<main class="wp-block-group">
	<!-- wp:pattern {"slug":"__SLUG__/home-hero"} /-->
	<!-- wp:pattern {"slug":"__SLUG__/home-statement"} /-->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer","tagName":"div"} /-->
```

- `templates/front-page.html` for the home page, `templates/page-<slug>.html` for a page: WordPress's
  template hierarchy picks it by the page's slug, no database setting needed.
- The template part's `tagName` is `div` (a `header` part would nest the design's `<header>` inside
  another); port.css makes that div `display: contents`.
- The design's `<main>` classes, if any, go on the main group's `className`.

## Posts (a journal or blog the owner wants as real WordPress posts)

The page that lists them stays a page template; its list is a pattern with a PHP `WP_Query` loop
printing the design's own card markup (one card per post: title, permalink, `get_the_excerpt()`,
the first category's slug where the design has `data-topic`, the featured image through
`wp_get_attachment_image_url()`). That keeps the design's markup and its filter script working. Post
pages use `templates/single.html` in the design's type. The design's sample articles become posts
(title, excerpt, category, featured image imported with `wp media import … --featured_image`),
published on dev only as placeholders and listed in the report.

How (*verified*):
- Create them with a `wp eval-file` script that defines `WP_IMPORTING` first. Publishing then
  schedules no pings to update services.
- Find each post by slug so a re-run updates it instead of duplicating it.
- Pin the lead story with `stick_post()`.
- Store the design's read time in a meta field.
- Import its image with `wp media import <theme file> --post_id=<id> --featured_image --alt=…`.
- Draft the install's "Hello world!" post, or it shows in the list.

Post pages, archives and the 404 have no design: build them from the design's own classes (its
page head, card meta, lead story title). Check them by eye and with `sitecheck site` through a
second pages file that lists those URLs.

## WordPress traps

Handled by the scaffold and the tools (know them, do not undo them):
- Template part wrappers and the root gap between header, main and footer: port.css section 1.
- WordPress's button element styles (colour, padding, radius): neutralised in theme.json.
- Pattern cache: a new or renamed pattern file is invisible until the theme's pattern cache is
  cleared; sync.sh clears it (staging and production need the same on deploy).
- WP Fastest Cache page files: sync.sh deletes them (WPFC's clear-all leaves files behind).
- Smooth-scrolling designs: the tools scroll instantly, or screenshots catch the page mid-scroll.

Watch for:
- **Plain permalinks.** Fresh Pete Panel sites ship with them, and `/about/` then answers 200 with
  the front page. Set `/%postname%/` before creating pages; sitecheck.mjs flags a link that renders
  the front page.
- **Relative URLs** (`src="assets/…"`, `href="about.html"`) resolve against `/about/` under
  permalinks: every URL goes through `__PREFIX___the_asset()` / `__PREFIX___the_link()` (themecheck.py).
- **wptexturize** curls straight quotes in templates and patterns; the scaffold turns it off so the
  export's quotes stay verbatim.
- **A padding shorthand on the design's container**: a port rule like `.entry { padding: 72px 0 }`
  on an element that is also `.wrap` wipes the wrap's side gutters. Use `padding-block`.
- **Block colour/spacing attributes** (`backgroundColor`, `style`, `fontSize`): never; they add
  classes and inline styles the design does not have. Styling comes from the design's classes.
- **`core/image` / `core/video` figures** and block-library defaults: measure, zero in port.css.
- **The admin bar** pushes a logged-in page down 32 px (46 px on phones, where it is not fixed): a
  fixed or sticky header needs `.admin-bar` offsets in port.css, or Pedro sees a gap on his phone.
  The tools browse logged out.
- **A design without a `*{box-sizing:border-box}` reset** (the inventory says so) renders
  content-box: never add a global box-sizing rule in port.css.
- **The in-app browser pane** drops external CSS and same-origin fonts on *.petelocal.net and paints
  white after scrolling: verify with the tools (headless Chromium), not the pane.
- **zsh**: quote heredoc delimiters (`<<'EOF'`) when the payload has `$` (`$190` disappears), quote
  URLs with `?` (`'/?s=x'` is a glob otherwise), and never rely on word splitting of unquoted
  variables.
