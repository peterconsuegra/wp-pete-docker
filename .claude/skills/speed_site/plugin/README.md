# __NAME__

__SITE__'s own Core Web Vitals layer, made for its block theme (`__THEME__`). Every feature is a
checkbox in Settings > Page Speed; unchecked, WordPress's output is untouched. With another theme
active, or while the shared Reblock Page Speed plugin is active, the plugin does nothing.

| Feature | What it does |
|---|---|
| Theme CSS inline | The theme's stylesheets (40 KB or less each) print inside the page, relative `url()`s made absolute: no stylesheet request before the first paint. |
| Theme JS inline | The theme's small classic scripts print where their `<script src>` was: same order, no request for the parser to wait on. Deferred, async and module scripts stay files. |
| First-screen image and fonts first | Each page's largest first-screen image (with its srcset) and its fonts, preloaded from the HTML, the image with `fetchpriority=high`. |
| Videos after the first paint | Video files load after the load event and once the first paint is on screen, when within a screen of view. The first-screen video shows its poster at once; later posters wait too, in the size the screen needs. |
| Right-sized photos | The theme's big photos get smaller copies in `srcset`, with `sizes` measured against the layout. |
| Third-party tags after the first interaction | Only when `includes/site.php` names scripts to hold back: they start on the first tap, scroll, key or mouse move, or 10 s after load. |
| No browser caching of HTML | PHP-rendered pages send `Cache-Control: no-cache` and an old `Expires`. |

What each page needs (its first-screen image and fonts, where the photos show) is in
`includes/site.php`. The photo copies are made by `bin/variants.py` (run it again when one of those
photos changes in the theme); `bin/check.mjs <site>` checks a running site.

## Rollback

Uncheck a feature, or deactivate the plugin (the page cache is emptied on activation and deactivation).
