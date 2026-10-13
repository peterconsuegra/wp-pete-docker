<?php
/**
 * /reblock_site: a design page's patterns become the page's own blocks.
 *
 * A /reblock_site theme draws each page from a template of patterns (templates/page-<slug>.html,
 * front-page.html): the copy lives in theme files, so neither the block editor nor an MCP
 * connector can change it. This script renders those patterns as the page shows them (the page's
 * own query, so page-dependent variants come out right) and saves the markup as the page's
 * content, with the theme's "canvas" template (header, the content, footer). Nothing else changes:
 * the markup is the patterns' own, so the page renders the same, pixel for pixel.
 *
 *   wp --user=<admin> eval-file to_content.php <prefix> <page path | ID | front> [save] [<template file>]
 *
 * - <prefix>: the theme's PHP prefix (ozonepolaris). While rendering, $GLOBALS['<prefix>_tokens'] is
 *   true: the theme prints live values (prices from products) as tokens it fills in at render time.
 * - Without "save" it only reports, and writes the content to /tmp/reblock-content/<slug>.html.
 * - The page's template: .reblock/templates/<name>.html when the run moved it there, else
 *   templates/<name>.html, or the file given last.
 * - A pattern made of live data (a WP_Query, the post's terms) is not copied: it stays live as
 *   <prefix>_token( 'section', <name> ) in a Custom HTML block.
 * - Links and asset URLs on the site's own host become root-relative, so the content works on any
 *   copy of the site (dev, staging, production).
 * Run as an administrator: an editor's save would pass the content through KSES.
 *
 * @package reblock_site
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

list( $reblock_prefix, $reblock_which, $reblock_mode, $reblock_tpl_file ) = array_pad( (array) $args, 4, '' );
if ( '' === $reblock_prefix || '' === $reblock_which ) {
	WP_CLI::error( 'usage: wp --user=<admin> eval-file to_content.php <prefix> <page path | ID | front> [save] [<template file>]' );
}

$reblock_front = (int) get_option( 'page_on_front' );
if ( 'front' === $reblock_which ) {
	$reblock_page = get_post( $reblock_front );
} elseif ( ctype_digit( $reblock_which ) ) {
	$reblock_page = get_post( (int) $reblock_which );
} else {
	$reblock_page = get_page_by_path( trim( $reblock_which, '/' ) );
}
if ( ! $reblock_page || 'page' !== $reblock_page->post_type ) {
	WP_CLI::error( 'No such page: ' . $reblock_which );
}
$reblock_is_front = $reblock_page->ID === $reblock_front;
$reblock_name     = $reblock_is_front ? 'front-page' : 'page-' . $reblock_page->post_name;
$reblock_theme    = get_stylesheet_directory();

if ( '' === $reblock_tpl_file ) {
	foreach ( array( '.reblock/templates/', 'templates/' ) as $reblock_dir ) {
		if ( is_file( $reblock_theme . '/' . $reblock_dir . $reblock_name . '.html' ) ) {
			$reblock_tpl_file = $reblock_theme . '/' . $reblock_dir . $reblock_name . '.html';
			break;
		}
	}
}
if ( '' === $reblock_tpl_file || ! is_file( $reblock_tpl_file ) ) {
	WP_CLI::error( 'No template ' . $reblock_name . '.html for ' . get_page_uri( $reblock_page ) );
}

/*
 * What lies between the header and the footer: the <main> group's blocks, then any block the
 * template puts after or before it (a case study's audit section). When the template's <main> has
 * classes the canvas's has not (ozp-main--case), its blocks keep them on a group of their own.
 */
$reblock_top = array_values(
	array_filter(
		parse_blocks( (string) file_get_contents( $reblock_tpl_file ) ),
		function ( $block ) {
			return null !== $block['blockName'] && 'core/template-part' !== $block['blockName'];
		}
	)
);
$reblock_main_at = null;
foreach ( $reblock_top as $reblock_i => $reblock_block ) {
	if ( 'core/group' === $reblock_block['blockName'] && 'main' === ( $reblock_block['attrs']['tagName'] ?? '' ) ) {
		$reblock_main_at = $reblock_i;
	}
}
if ( null === $reblock_main_at ) {
	WP_CLI::error( basename( $reblock_tpl_file ) . ' has no <main> group at its top level: nothing to move into the page.' );
}
$reblock_canvas_classes = array();
if ( is_file( $reblock_theme . '/templates/canvas.html' ) && preg_match( '/wp:post-content (\{.*?\}) \/-->/', (string) file_get_contents( $reblock_theme . '/templates/canvas.html' ), $reblock_m ) ) {
	$reblock_canvas_classes = preg_split( '/\s+/', (string) ( json_decode( $reblock_m[1], true )['className'] ?? '' ), -1, PREG_SPLIT_NO_EMPTY );
}
$reblock_main_extra = array_values( array_diff( preg_split( '/\s+/', (string) ( $reblock_top[ $reblock_main_at ]['attrs']['className'] ?? '' ), -1, PREG_SPLIT_NO_EMPTY ), $reblock_canvas_classes ) );

// Pattern files by slug (the theme's patterns/*.php, by their Slug: header).
$reblock_files = array();
foreach ( glob( $reblock_theme . '/patterns/*.php' ) as $reblock_file ) {
	if ( preg_match( '/^\s*\*\s*Slug:\s*(\S+)/m', (string) file_get_contents( $reblock_file, false, null, 0, 2048 ), $reblock_m ) ) {
		$reblock_files[ $reblock_m[1] ] = $reblock_file;
	}
}

// The page's own query: is_front_page(), is_page() and the queried page as when it is visited.
$GLOBALS['wp_the_query'] = new WP_Query( array( 'page_id' => $reblock_page->ID ) );
$GLOBALS['wp_query']     = $GLOBALS['wp_the_query'];
$GLOBALS['post']         = $reblock_page;
setup_postdata( $reblock_page );

$reblock_report = array(
	'page'     => get_page_uri( $reblock_page ),
	'id'       => $reblock_page->ID,
	'template' => str_replace( $reblock_theme . '/', '', $reblock_tpl_file ),
	'patterns' => 0,
	'live'     => array(),
	'notices'  => array(),
);

/*
 * A pattern's output (block markup), its nested patterns expanded, or a token for a live section.
 * A closure: WP-CLI runs this file inside a function, so its variables are not globals.
 */
$reblock_pattern = function ( $slug ) use ( &$reblock_pattern, $reblock_files, &$reblock_report, $reblock_prefix ) {
	if ( empty( $reblock_files[ $slug ] ) ) {
		WP_CLI::error( 'No pattern file for ' . $slug );
	}
	$file = $reblock_files[ $slug ];
	$name = basename( $file, '.php' );
	++$reblock_report['patterns'];
	if ( preg_match( '/new\s+WP_Query|have_posts\s*\(|the_post\s*\(|get_the_ID\s*\(|get_the_category|wp_get_post_categories|paginate_links/', (string) file_get_contents( $file ) ) ) {
		$reblock_report['live'][] = $name;
		$token_fn = $reblock_prefix . '_token';
		$token    = function_exists( $token_fn ) ? $token_fn( 'section', $name ) : '{{' . $reblock_prefix . ':section ' . $name . '}}';
		return "<!-- wp:html -->\n" . $token . "\n<!-- /wp:html -->";
	}
	$html = ( static function ( $reblock_pattern_file ) {
		ob_start();
		include $reblock_pattern_file;
		return (string) ob_get_clean();
	} )( $file );
	$html = preg_replace_callback(
		'/<!-- wp:pattern (\{.*?\}) \/-->/',
		function ( $m ) use ( &$reblock_pattern ) {
			$attrs = json_decode( $m[1], true );
			return $reblock_pattern( (string) ( $attrs['slug'] ?? '' ) );
		},
		$html
	);
	return trim( $html );
};

set_error_handler(
	function ( $errno, $errstr, $errfile, $errline ) use ( &$reblock_report ) {
		$reblock_report['notices'][] = $errstr . ' (' . basename( $errfile ) . ':' . $errline . ')';
		return true;
	}
);
$GLOBALS[ $reblock_prefix . '_tokens' ] = true;
$reblock_expand = function ( array $blocks ) use ( $reblock_pattern ) {
	$parts = array();
	foreach ( $blocks as $block ) {
		if ( 'core/pattern' === $block['blockName'] ) {
			$parts[] = $reblock_pattern( (string) ( $block['attrs']['slug'] ?? '' ) );
		} elseif ( null !== $block['blockName'] ) {
			$parts[] = trim( serialize_block( $block ) );
		}
	}
	return implode( "\n\n", $parts );
};
$reblock_parts = array();
foreach ( $reblock_top as $reblock_i => $reblock_block ) {
	if ( $reblock_i !== $reblock_main_at ) {
		$reblock_parts[] = $reblock_expand( array( $reblock_block ) );
		continue;
	}
	$reblock_inner = $reblock_expand( $reblock_block['innerBlocks'] );
	if ( $reblock_main_extra ) {
		$reblock_class = implode( ' ', $reblock_main_extra );
		$reblock_inner = '<!-- wp:group ' . wp_json_encode( array( 'className' => $reblock_class, 'layout' => array( 'type' => 'default' ) ) ) . " -->\n<div class=\"wp-block-group " . esc_attr( $reblock_class ) . "\">\n" . $reblock_inner . "\n</div>\n<!-- /wp:group -->";
	}
	$reblock_parts[] = $reblock_inner;
}
$GLOBALS[ $reblock_prefix . '_tokens' ] = false;
restore_error_handler();
wp_reset_postdata();

$reblock_content = implode( "\n\n", $reblock_parts ) . "\n";

// The site's own URLs, root-relative: the same content works on dev, staging and production.
$reblock_home = untrailingslashit( home_url() );
foreach ( array_unique( array( $reblock_home, set_url_scheme( $reblock_home, 'http' ), set_url_scheme( $reblock_home, 'https' ) ) ) as $reblock_origin ) {
	foreach ( array( $reblock_origin, str_replace( '/', '\\/', $reblock_origin ) ) as $reblock_o ) {
		$reblock_content = str_replace( array( '"' . $reblock_o . '"', "'" . $reblock_o . "'" ), array( '"/"', "'/'" ), $reblock_content );
		$reblock_content = preg_replace( '#' . preg_quote( $reblock_o, '#' ) . '(?=[/?\#\\\\])#', '', $reblock_content );
	}
}

// What WordPress's content filters would change, unlike in a template: a smiley, "Wordpress", a
// shortcode. The page would not render as before.
$reblock_report['bytes']  = strlen( $reblock_content );
$reblock_report['tokens'] = preg_match_all( '/\{\{[a-z0-9_-]+:[^}]+\}\}/', $reblock_content );
$reblock_checks           = array(
	'php left'          => false !== strpos( $reblock_content, '<?php' ),
	'pattern refs left' => false !== strpos( $reblock_content, '<!-- wp:pattern' ),
	'own host left'     => false !== strpos( $reblock_content, wp_parse_url( $reblock_home, PHP_URL_HOST ) ),
	'smilies'           => convert_smilies( $reblock_content ) !== $reblock_content,
	'capital_P_dangit'  => capital_P_dangit( $reblock_content ) !== $reblock_content,
	'shortcodes'        => do_shortcode( $reblock_content ) !== $reblock_content,
);
$reblock_report['problems'] = array_keys( array_filter( $reblock_checks ) );

$reblock_out = '/tmp/reblock-content/' . sanitize_file_name( str_replace( '/', '-', get_page_uri( $reblock_page ) ) ) . '.html';
wp_mkdir_p( dirname( $reblock_out ) );
file_put_contents( $reblock_out, $reblock_content );
$reblock_report['file'] = $reblock_out;

if ( 'save' === $reblock_mode ) {
	if ( $reblock_report['problems'] || $reblock_report['notices'] ) {
		WP_CLI::error( 'Not saved: ' . wp_json_encode( $reblock_report ) );
	}
	$reblock_saved = wp_update_post(
		array(
			'ID'           => $reblock_page->ID,
			'post_content' => wp_slash( $reblock_content ),
		),
		true
	);
	if ( is_wp_error( $reblock_saved ) ) {
		WP_CLI::error( $reblock_saved->get_error_message() );
	}
	update_post_meta( $reblock_page->ID, '_wp_page_template', 'canvas' );
	$reblock_report['saved'] = true;
}

WP_CLI::line( wp_json_encode( $reblock_report, JSON_UNESCAPED_SLASHES ) );
