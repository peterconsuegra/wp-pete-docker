<?php
/**
 * Helpers the patterns use.
 *
 * import_assets.py writes assets/manifest.json, which maps the export's own paths
 * ('assets/photos/hero.jpg') to the theme's files, so patterns keep the export's markup and paths:
 *   <img src="<?php __PREFIX___the_asset( 'assets/photos/hero.jpg' ); ?>" alt="" width="85" height="34">
 * Pages are linked by key (the page slug; '' or 'home' is the front page):
 *   <a href="<?php __PREFIX___the_link( 'about' ); ?>"<?php __PREFIX___current( 'about' ); ?>>About</a>
 *
 * @package __SLUG__
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue a theme stylesheet, versioned by its modification time; a missing or empty file is skipped.
 *
 * @param string $handle Handle.
 * @param string $rel    Path inside the theme.
 */
function __PREFIX___enqueue_style( $handle, $rel ) {
	$file = get_theme_file_path( $rel );
	if ( is_file( $file ) && filesize( $file ) > 0 ) {
		wp_enqueue_style( $handle, get_theme_file_uri( $rel ), array(), (string) filemtime( $file ) );
	}
}

/**
 * Enqueue a theme script in the footer (where exports load theirs), versioned like the styles.
 *
 * @param string $handle Handle.
 * @param string $rel    Path inside the theme.
 */
function __PREFIX___enqueue_script( $handle, $rel ) {
	$file = get_theme_file_path( $rel );
	if ( is_file( $file ) && filesize( $file ) > 0 ) {
		wp_enqueue_script( $handle, get_theme_file_uri( $rel ), array(), (string) filemtime( $file ), true );
	}
}

/**
 * The asset manifest, read once per request.
 *
 * @return array
 */
function __PREFIX___manifest() {
	static $manifest = null;
	if ( null === $manifest ) {
		$file     = get_theme_file_path( 'assets/manifest.json' );
		$manifest = is_file( $file ) ? (array) json_decode( (string) file_get_contents( $file ), true ) : array();
	}
	return $manifest;
}

/**
 * URL of an imported file, by its path in the export. An unknown path returns '' and logs it
 * (themecheck.py reports these before a sync, so this is the last line of defence).
 *
 * @param string $path Path in the export, e.g. 'assets/photos/hero.jpg'.
 * @return string
 */
function __PREFIX___asset_url( $path ) {
	$manifest = __PREFIX___manifest();
	if ( empty( $manifest[ $path ]['src'] ) ) {
		error_log( '__SLUG__: not in assets/manifest.json: ' . $path ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		return '';
	}
	return get_theme_file_uri( $manifest[ $path ]['src'] );
}

/**
 * Echo an imported file's URL, escaped.
 *
 * @param string $path Path in the export.
 */
function __PREFIX___the_asset( $path ) {
	echo esc_url( __PREFIX___asset_url( $path ) );
}

/**
 * URL of a page by key: '' or 'home' is the front page, any other key the page with that path.
 *
 * @param string $key    Page key (slug, or parent/child).
 * @param string $anchor Optional fragment, without '#'.
 * @return string
 */
function __PREFIX___link( $key = '', $anchor = '' ) {
	if ( '' === $key || 'home' === $key ) {
		$url = home_url( '/' );
	} else {
		$page = get_page_by_path( $key );
		$url  = $page ? get_permalink( $page ) : home_url( '/' . trim( $key, '/' ) . '/' );
	}
	return $url . ( '' !== $anchor ? '#' . $anchor : '' );
}

/**
 * Echo a page URL, escaped.
 *
 * @param string $key    Page key.
 * @param string $anchor Optional fragment.
 */
function __PREFIX___the_link( $key = '', $anchor = '' ) {
	echo esc_url( __PREFIX___link( $key, $anchor ) );
}

/**
 * Key of the page being shown: 'home' on the front page, the page path on a page or the posts page,
 * 'post' on a single post, '' elsewhere.
 *
 * @return string
 */
function __PREFIX___page_key() {
	if ( is_front_page() ) {
		return 'home';
	}
	if ( is_home() && get_option( 'page_for_posts' ) ) {
		return get_page_uri( (int) get_option( 'page_for_posts' ) );
	}
	if ( is_page() ) {
		return get_page_uri( get_queried_object_id() );
	}
	return is_singular( 'post' ) ? 'post' : '';
}

/**
 * Echo aria-current="page" when $key is the page being shown (the design's own current-page marker).
 *
 * @param string $key Page key.
 */
function __PREFIX___current( $key ) {
	if ( __PREFIX___page_key() === ( '' === $key ? 'home' : $key ) ) {
		echo ' aria-current="page"';
	}
}
