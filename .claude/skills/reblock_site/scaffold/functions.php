<?php
/**
 * __NAME__: block theme built by /reblock_site from __SOURCE__ (__DATE__).
 *
 * Every page is a template made of patterns (templates/front-page.html, templates/page-<slug>.html,
 * patterns/<page>-<section>.php): the site lives in these files, not in the database. The design's
 * own CSS and JS are assets/css/site.css and assets/js/site.js, verbatim from the export; what the
 * port adds is in assets/css/port.css and assets/js/port.js.
 *
 * @package __SLUG__
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/inc/assets.php';

add_action(
	'after_setup_theme',
	function () {
		add_theme_support( 'editor-styles' );
		add_editor_style( array( 'assets/css/fonts.css', 'assets/css/site.css', 'assets/css/pages.css', 'assets/css/port.css' ) );
		remove_theme_support( 'core-block-patterns' );
	}
);

// The design's order: fonts, its CSS (pages.css: a claude.ai/design export's inline styles as classes),
// then the port's rules on top; scripts at the end of the body. Missing or empty files are skipped.
add_action(
	'wp_enqueue_scripts',
	function () {
		__PREFIX___enqueue_style( '__SLUG__-fonts', 'assets/css/fonts.css' );
		__PREFIX___enqueue_style( '__SLUG__-site', 'assets/css/site.css' );
		__PREFIX___enqueue_style( '__SLUG__-pages', 'assets/css/pages.css' );
		__PREFIX___enqueue_style( '__SLUG__-port', 'assets/css/port.css' );
		__PREFIX___enqueue_script( '__SLUG__-site', 'assets/js/site.js' );
		__PREFIX___enqueue_script( '__SLUG__-port', 'assets/js/port.js' );
	}
);

add_action(
	'init',
	function () {
		register_block_pattern_category( '__SLUG__', array( 'label' => '__NAME__' ) );
	}
);

// The export never loads WordPress's emoji script.
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );

// Quotes and dashes exactly as the export writes them: wptexturize would curl the export's straight
// apostrophes ("we're") in templates and patterns.
add_filter( 'run_wptexturize', '__return_false' );
