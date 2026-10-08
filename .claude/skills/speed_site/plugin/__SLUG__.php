<?php
/**
 * Plugin Name: __NAME__
 * Description: __SITE__'s own Core Web Vitals layer (theme __THEME__), made by /speed_site. The theme's CSS and small scripts print inside the page, each page's first-screen image and fonts are requested with the HTML, videos start once the page is on screen (later posters in the size the screen needs), the theme's big photos get smaller copies in srcset, and HTML is never browser-cached. One checkbox per feature in Settings > Page Speed.
 * Version: 1.0.0
 * Requires at least: 6.6
 * Requires PHP: 8.0
 * Author: Ozone Group
 * Text Domain: __SLUG__
 *
 * @package __SLUG__
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( '__CONST___VERSION', '1.0.0' );
define( '__CONST___DIR', __DIR__ );

require_once __DIR__ . '/includes/site.php';
require_once __DIR__ . '/includes/features.php';
require_once __DIR__ . '/includes/settings.php';

/**
 * The features, in the order of the settings page. A key missing from the saved option takes its
 * default, so a new feature in an update starts at its default. "delay_tags" exists only when
 * includes/site.php names scripts to hold back.
 *
 * @return array
 */
function __PREFIX___features() {
	$features = array(
		'inline_css' => array(
			'label'   => 'Theme CSS inline',
			'help'    => 'The theme\'s stylesheets (40 KB or less each) print inside the page instead of loading as files: nothing holds the first paint.',
			'default' => 1,
		),
		'inline_js'  => array(
			'label'   => 'Theme JS inline',
			'help'    => 'The theme\'s small classic scripts (20 KB or less each) print where their <script src> was: same order, no request for the parser to wait on.',
			'default' => 1,
		),
		'preload'    => array(
			'label'   => 'First-screen image and fonts first',
			'help'    => 'Each page\'s largest first-screen image and its fonts are requested with the HTML, the image with fetchpriority=high.',
			'default' => 1,
		),
		'videos'     => array(
			'label'   => 'Videos after the first paint',
			'help'    => 'Video files load once the page is on screen and only when within a screen of view. The first-screen video shows its poster at once; later posters wait too, in the size the screen needs.',
			'default' => 1,
		),
		'images'     => array(
			'label'   => 'Right-sized photos',
			'help'    => 'The theme\'s big photos get smaller copies in srcset, with sizes measured against the layout: phones download the copy that fits.',
			'default' => 1,
		),
	);
	if ( __PREFIX___site()['delay'] ) {
		$features['delay_tags'] = array(
			'label'   => 'Third-party tags after the first interaction',
			'help'    => 'The tracking and chat scripts named in includes/site.php start on the first tap, scroll, key or mouse move, or 10 s after load. Visitors who leave sooner are not counted.',
			'default' => 1,
		);
	}
	$features['html_no_cache'] = array(
		'label'   => 'No browser caching of HTML',
		'help'    => 'Pages rendered by PHP say no-cache, so a server-wide Expires rule cannot keep an old page in browsers. WP Fastest Cache\'s saved pages already do.',
		'default' => 1,
	);
	return $features;
}

/**
 * Whether a feature runs on this request: front end only, the theme this plugin was made for
 * active, the shared Reblock Page Speed plugin not active (both would do the same work twice), the
 * saved checkbox (or its default), then the __OPTION___feature filter.
 *
 * @param string $feature Feature key.
 * @return bool
 */
function __PREFIX___on( $feature ) {
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
		return false;
	}
	if ( __PREFIX___site()['theme'] !== get_stylesheet() || function_exists( 'rps_on' ) ) {
		return false;
	}
	$features = __PREFIX___features();
	if ( ! isset( $features[ $feature ] ) ) {
		return false;
	}
	$saved = get_option( '__OPTION__', array() );
	$on    = isset( $saved[ $feature ] ) ? (bool) $saved[ $feature ] : (bool) $features[ $feature ]['default'];
	return (bool) apply_filters( '__OPTION___feature', $on, $feature );
}

/**
 * Empty WP Fastest Cache: its own clear, then the page cache folder itself (its clear-all can leave
 * files behind).
 */
function __PREFIX___purge_cache() {
	if ( isset( $GLOBALS['wp_fastest_cache'] ) && method_exists( $GLOBALS['wp_fastest_cache'], 'deleteCache' ) ) {
		$GLOBALS['wp_fastest_cache']->deleteCache( true );
	}
	$dir = WP_CONTENT_DIR . '/cache/all';
	if ( is_dir( $dir ) ) {
		$files = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
		foreach ( $files as $file ) {
			$file->isDir() ? @rmdir( $file->getPathname() ) : @unlink( $file->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
	}
}
register_activation_hook( __FILE__, '__PREFIX___purge_cache' );
register_deactivation_hook( __FILE__, '__PREFIX___purge_cache' );
