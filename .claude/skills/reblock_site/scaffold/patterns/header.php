<?php
/**
 * Title: Header
 * Slug: __SLUG__/header
 * Categories: __SLUG__
 * Inserter: no
 *
 * The design's header, verbatim, in one wp:html island: page links through __PREFIX___the_link(),
 * the current page through __PREFIX___current(), images through __PREFIX___the_asset(). Each header
 * variant inventory.mjs lists (overlay on the home page, another logo...) is a PHP condition here.
 *
 * @package __SLUG__
 */

?>
<!-- wp:html -->
<header class="site-header"><a href="<?php __PREFIX___the_link(); ?>"><?php bloginfo( 'name' ); ?></a></header>
<!-- /wp:html -->
