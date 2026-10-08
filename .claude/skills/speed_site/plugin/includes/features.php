<?php
/**
 * The features. Every one checks __PREFIX___on() first, so an unchecked box leaves WordPress's output
 * exactly as it was. What the site needs comes from includes/site.php.
 *
 * @package __SLUG__
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* Pages ------------------------------------------------------------------------------------- */

/**
 * Key of the page being shown: "home", a page path ("about", "parent/child"), "post", or "".
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
 * This page's needs: its first-screen items, and the fonts of every page plus its own.
 *
 * @return array [ 'lcp' => [ items ], 'fonts' => [ theme-relative files ] ]
 */
function __PREFIX___page_needs() {
	$site = __PREFIX___site();
	$page = $site['pages'][ __PREFIX___page_key() ] ?? array();
	return array(
		'lcp'   => (array) ( $page['lcp'] ?? array() ),
		'fonts' => array_values( array_unique( array_merge( (array) $site['fonts'], (array) ( $page['fonts'] ?? array() ) ) ) ),
	);
}

/* Theme files --------------------------------------------------------------------------------- */

/**
 * Theme file behind a theme URL ('' when the URL is not a file of the active theme).
 *
 * @param string $url URL.
 * @return string
 */
function __PREFIX___theme_file( $url ) {
	$url  = strtok( (string) $url, '?#' );
	$base = get_stylesheet_directory_uri();
	if ( 0 !== strpos( $url, $base . '/' ) ) {
		return '';
	}
	$root = realpath( get_stylesheet_directory() );
	$file = realpath( $root . substr( $url, strlen( $base ) ) );
	return ( $file && 0 === strpos( $file, $root . DIRECTORY_SEPARATOR ) && is_file( $file ) ) ? $file : '';
}

/**
 * URL of a theme-relative path, or a URL as is ('' for a theme path that is not a file).
 *
 * @param string $path Path or URL.
 * @return string
 */
function __PREFIX___theme_url( $path ) {
	$path = (string) $path;
	if ( preg_match( '#^(https?:)?//#i', $path ) || 0 === strpos( $path, '/' ) ) {
		return $path;
	}
	return is_file( get_stylesheet_directory() . '/' . $path ) ? get_stylesheet_directory_uri() . '/' . $path : '';
}

/**
 * Resolve a relative URL against a directory URL ("../fonts/a.woff2" from ".../assets/css").
 *
 * @param string $dir Directory URL, no trailing slash.
 * @param string $rel Relative URL.
 * @return string
 */
function __PREFIX___resolve_url( $dir, $rel ) {
	$parts = wp_parse_url( $dir );
	$path  = explode( '/', trim( $parts['path'] ?? '', '/' ) );
	$tail  = '';
	if ( preg_match( '/^([^?#]*)([?#].*)?$/', $rel, $m ) ) {
		$rel  = $m[1];
		$tail = $m[2] ?? '';
	}
	foreach ( explode( '/', $rel ) as $segment ) {
		if ( '..' === $segment ) {
			array_pop( $path );
		} elseif ( '.' !== $segment && '' !== $segment ) {
			$path[] = $segment;
		}
	}
	$origin = ( isset( $parts['scheme'] ) ? $parts['scheme'] . '://' : '//' ) . ( $parts['host'] ?? '' ) . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
	return $origin . '/' . implode( '/', $path ) . $tail;
}

/* First-screen image and fonts first ------------------------------------------------------------ */

/**
 * Images found for this page's classes while the blocks render (the template renders before
 * wp_head): [ url, srcset, sizes ] per class.
 *
 * @param string|null $class Class to look up, or null for the whole map.
 * @param array|null  $image Image to record.
 * @return array
 */
function __PREFIX___captured( $class = null, $image = null ) {
	static $found = array();
	if ( null !== $image ) {
		$found[ $class ] = $image;
	}
	return null === $class ? $found : ( $found[ $class ] ?? array() );
}

/**
 * Record the image behind each first-screen class of this page the first time a block has it: an
 * <img>'s src (with its srcset and sizes), a <video>'s poster, or the first <img> inside.
 *
 * @param string $html Rendered block.
 * @return string
 */
function __PREFIX___capture( $html ) {
	if ( ! __PREFIX___on( 'preload' ) ) {
		return $html;
	}
	foreach ( __PREFIX___page_needs()['lcp'] as $item ) {
		$class = is_array( $item ) ? (string) ( $item['class'] ?? '' ) : '';
		if ( '' === $class || __PREFIX___captured( $class ) || false === strpos( $html, $class ) ) {
			continue;
		}
		if ( ! preg_match( '/<([a-z0-9]+)\b[^>]*\bclass="[^"]*(?<![\w-])' . preg_quote( $class, '/' ) . '(?![\w-])[^"]*"[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE ) ) {
			continue;
		}
		$open = $m[0][0];
		$img  = '';
		$url  = '';
		if ( 'img' === strtolower( $m[1][0] ) ) {
			$img = $open;
		} elseif ( 'video' === strtolower( $m[1][0] ) && preg_match( '/\s(?:data-__PREFIX__-)?poster="([^"]+)"/i', $open, $s ) ) {
			$url = $s[1];
		} elseif ( preg_match( '/<img\b[^>]*>/i', substr( $html, $m[0][1] ), $s ) ) {
			$img = $s[0];
		}
		if ( $img && preg_match( '/\ssrc="([^"]+)"/i', $img, $s ) ) {
			$url = $s[1];
		}
		if ( $url ) {
			// An image with a srcset is preloaded with the same candidates, or the browser fetches it twice.
			__PREFIX___captured(
				$class,
				array(
					'url'    => html_entity_decode( $url ),
					'srcset' => preg_match( '/\ssrcset="([^"]+)"/i', $img, $s ) ? html_entity_decode( $s[1] ) : '',
					'sizes'  => preg_match( '/\ssizes="([^"]+)"/i', $img, $s ) ? html_entity_decode( $s[1] ) : '',
				)
			);
		}
	}
	return $html;
}
add_filter( 'render_block', '__PREFIX___capture', 20 );

/**
 * This page's first-screen images: [ [ url, srcset, sizes, media ] ].
 *
 * @return array
 */
function __PREFIX___lcp_items() {
	$items = array();
	foreach ( __PREFIX___page_needs()['lcp'] as $item ) {
		if ( ! is_array( $item ) ) {
			continue;
		}
		$found = array();
		if ( ! empty( $item['class'] ) ) {
			$found = __PREFIX___captured( (string) $item['class'] );
		} elseif ( ! empty( $item['featured'] ) ) {
			$id    = is_singular() ? get_post_thumbnail_id( get_queried_object_id() ) : 0;
			$found = $id ? array( 'url' => (string) wp_get_attachment_image_url( $id, 'full' ) ) : array();
		} elseif ( ! empty( $item['image'] ) ) {
			$found = array( 'url' => __PREFIX___theme_url( $item['image'] ) );
		}
		if ( ! empty( $found['url'] ) ) {
			$items[] = $found + array(
				'srcset' => '',
				'sizes'  => '',
				'media'  => (string) ( $item['media'] ?? '' ),
			);
		}
	}
	return $items;
}

/**
 * Preload links, first thing in <head>.
 */
function __PREFIX___print_preloads() {
	if ( ! __PREFIX___on( 'preload' ) ) {
		return;
	}
	foreach ( __PREFIX___lcp_items() as $item ) {
		printf(
			'<link rel="preload" as="image" href="%s"%s fetchpriority="high"%s>' . "\n",
			esc_url( $item['url'] ),
			$item['srcset'] ? ' imagesrcset="' . esc_attr( $item['srcset'] ) . '" imagesizes="' . esc_attr( $item['sizes'] ? $item['sizes'] : '100vw' ) . '"' : '',
			$item['media'] ? ' media="' . esc_attr( $item['media'] ) . '"' : ''
		);
	}
	foreach ( __PREFIX___page_needs()['fonts'] as $font ) {
		$url = __PREFIX___theme_url( $font );
		if ( $url ) {
			printf( '<link rel="preload" as="font" type="font/woff2" href="%s" crossorigin>' . "\n", esc_url( $url ) );
		}
	}
}
add_action( 'wp_head', '__PREFIX___print_preloads', 1 );

/**
 * The first-screen <img> gets fetchpriority=high and loses loading=lazy; any other image on that
 * page loses WordPress's automatic fetchpriority=high, so only one request is boosted.
 *
 * @param string $html The <img> tag.
 * @return string
 */
function __PREFIX___img_tag( $html ) {
	if ( ! __PREFIX___on( 'preload' ) ) {
		return $html;
	}
	$items = __PREFIX___lcp_items();
	if ( ! $items || ! preg_match( '/\ssrc="([^"]+)"/', $html, $m ) ) {
		return $html;
	}
	$src = html_entity_decode( $m[1] );
	foreach ( $items as $item ) {
		if ( $item['url'] === $src ) {
			$html = preg_replace( '/\s(loading|fetchpriority)="[^"]*"/i', '', $html );
			return preg_replace( '/^<img\b/i', '<img fetchpriority="high"', $html );
		}
	}
	return str_replace( ' fetchpriority="high"', '', $html );
}
add_filter( 'wp_content_img_tag', '__PREFIX___img_tag', 20 );

/* Theme CSS and JS inline ----------------------------------------------------------------------- */

/**
 * The theme's stylesheets printed inline (40 KB or less each), their relative url()s made absolute.
 *
 * @param string $tag    The <link> tag.
 * @param string $handle Handle.
 * @param string $href   URL.
 * @param string $media  Media.
 * @return string
 */
function __PREFIX___inline_style( $tag, $handle, $href, $media ) {
	if ( 0 !== strpos( $handle, __PREFIX___site()['theme'] . '-' ) || ! __PREFIX___on( 'inline_css' ) ) {
		return $tag;
	}
	$file = __PREFIX___theme_file( $href );
	if ( ! $file || filesize( $file ) > 40 * 1024 ) {
		return $tag;
	}
	$dir = dirname( strtok( $href, '?#' ) );
	$css = preg_replace_callback(
		'/url\(\s*([\'"]?)([^\'")]+)\1\s*\)/i',
		function ( $m ) use ( $dir ) {
			if ( preg_match( '#^(data:|https?:|//|/|\#)#i', trim( $m[2] ) ) ) {
				return $m[0];
			}
			return 'url("' . __PREFIX___resolve_url( $dir, trim( $m[2] ) ) . '")';
		},
		(string) file_get_contents( $file )
	);
	if ( $media && 'all' !== $media ) {
		$css = '@media ' . $media . '{' . $css . '}';
	}
	return sprintf( "<style id=\"%s-css\">\n%s\n</style>\n", esc_attr( $handle ), $css );
}
add_filter( 'style_loader_tag', '__PREFIX___inline_style', 10, 4 );

/**
 * The theme's classic scripts (20 KB or less each) printed inline where their <script src> was: the
 * same place in the page, without a request the parser has to wait for. Deferred, async and module
 * scripts stay files: inline, they would run at another moment.
 *
 * @param string $tag    Script tags (with any inline before/after).
 * @param string $handle Handle.
 * @param string $src    URL.
 * @return string
 */
function __PREFIX___inline_script( $tag, $handle, $src ) {
	if ( 0 !== strpos( $handle, __PREFIX___site()['theme'] . '-' ) || ! __PREFIX___on( 'inline_js' ) ) {
		return $tag;
	}
	$file = __PREFIX___theme_file( $src );
	if ( ! $file || filesize( $file ) > 20 * 1024 ) {
		return $tag;
	}
	$js = (string) file_get_contents( $file );
	if ( false !== stripos( $js, '</script' ) ) {
		return $tag;
	}
	return preg_replace_callback(
		'#<script\b([^>]*)\ssrc=(["\'])[^"\']*\2([^>]*)>\s*</script>\n?#i',
		function ( $m ) use ( $js, $handle ) {
			if ( preg_match( '/\b(defer|async)\b|type=["\']module/i', $m[1] . $m[3] ) ) {
				return $m[0];
			}
			return wp_get_inline_script_tag( "\n" . $js . "\n", array( 'id' => $handle . '-js' ) );
		},
		$tag,
		1
	);
}
add_filter( 'script_loader_tag', '__PREFIX___inline_script', 10, 3 );

/* Right-sized photos ----------------------------------------------------------------------------- */

/**
 * The smaller copies of the theme's big photos (assets/img/variants.json, written by bin/variants.py).
 *
 * @return array Theme-relative path => [ w, h, variants => [ [ file, w, h ] ] ].
 */
function __PREFIX___variants() {
	static $variants = null;
	if ( null === $variants ) {
		$file     = __CONST___DIR . '/assets/img/variants.json';
		$variants = is_file( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : array();
		$variants = is_array( $variants ) ? $variants : array();
	}
	return $variants;
}

/**
 * The srcset of a theme photo: its copies, then the theme's own file ('' when it has no copies).
 *
 * @param string $url The theme photo's URL.
 * @return string
 */
function __PREFIX___srcset( $url ) {
	$base = get_stylesheet_directory_uri() . '/';
	$path = strtok( (string) $url, '?#' );
	if ( 0 !== strpos( $path, $base ) ) {
		return '';
	}
	$entry = __PREFIX___variants()[ substr( $path, strlen( $base ) ) ] ?? null;
	if ( ! $entry ) {
		return '';
	}
	$set = array();
	foreach ( $entry['variants'] as $variant ) {
		$set[] = plugins_url( 'assets/img/' . $variant[0], __CONST___DIR . '/__SLUG__.php' ) . ' ' . (int) $variant[1] . 'w';
	}
	$set[] = $url . ' ' . (int) $entry['w'] . 'w';
	return implode( ', ', $set );
}

/**
 * Theme photos get their copies as srcset, with the sizes measured for their place on this page
 * (includes/site.php "sizes"). A photo in a place not measured is left alone.
 *
 * @param string $html  Rendered block.
 * @param array  $block Block.
 * @return string
 */
function __PREFIX___images( $html, $block ) {
	if ( ! in_array( $block['blockName'] ?? '', array( 'core/html', 'core/image' ), true ) || false === strpos( $html, '<img' ) || ! __PREFIX___on( 'images' ) ) {
		return $html;
	}
	$sizes = __PREFIX___site()['sizes'][ __PREFIX___page_key() ] ?? array();
	if ( ! $sizes ) {
		return $html;
	}
	return preg_replace_callback(
		'/<img\b[^>]*>/i',
		function ( $m ) use ( $sizes ) {
			$img = $m[0];
			if ( preg_match( '/\ssrcset=/i', $img ) || ! preg_match( '/\ssrc="([^"]+)"/i', $img, $s ) ) {
				return $img;
			}
			$url  = html_entity_decode( $s[1] );
			$file = basename( (string) strtok( $url, '?#' ) );
			$set  = isset( $sizes[ $file ] ) ? __PREFIX___srcset( $url ) : '';
			if ( ! $set ) {
				return $img;
			}
			return preg_replace( '/^<img\b/i', '<img srcset="' . esc_attr( $set ) . '" sizes="' . esc_attr( $sizes[ $file ] ) . '"', $img );
		},
		$html
	);
}
add_filter( 'render_block', '__PREFIX___images', 10, 2 );

/* Videos after the first paint --------------------------------------------------------------------- */

/**
 * One <video>: its files move to data-__PREFIX__-src (preload none). The first-screen video keeps its
 * poster (includes/site.php "keep_poster", or the page's first video); every other poster waits too,
 * with its copies in data-__PREFIX__-posters. assets/js/videos.js puts everything back once the page
 * is on screen, for videos within a screen of view.
 *
 * @param array $m Regex match: the whole <video>…</video>.
 * @return string
 */
function __PREFIX___video( $m ) {
	static $count = 0;
	$video = $m[0];
	if ( false !== strpos( $video, 'data-__PREFIX__-video' ) || ! preg_match( '#^<video\b[^>]*>#i', $video, $open ) ) {
		return $video;
	}
	++$count;
	$tag     = $open[0];
	$keep    = (string) __PREFIX___site()['keep_poster'];
	$first   = '' === $keep ? 1 === $count : (bool) preg_match( '/\sclass="[^"]*(?<![\w-])' . preg_quote( $keep, '/' ) . '(?![\w-])/i', $tag );
	$preload = preg_match( '/\spreload="([^"]*)"/i', $tag, $p ) ? $p[1] : '';
	$new     = preg_replace( '/\spreload="[^"]*"/i', '', $tag );
	$new     = preg_replace( '/\ssrc="([^"]*)"/i', ' data-__PREFIX__-src="$1"', $new );
	if ( ! $first && preg_match( '/\sposter="([^"]*)"/i', $new, $poster ) ) {
		$set = __PREFIX___srcset( html_entity_decode( $poster[1] ) );
		$new = str_replace( $poster[0], ' data-__PREFIX__-poster="' . $poster[1] . '"' . ( $set ? ' data-__PREFIX__-posters="' . esc_attr( $set ) . '"' : '' ), $new );
	}
	$new   = preg_replace( '/^<video\b/i', '<video data-__PREFIX__-video preload="none"' . ( '' !== $preload ? ' data-__PREFIX__-preload="' . esc_attr( $preload ) . '"' : '' ), $new );
	$video = $new . substr( $video, strlen( $tag ) );
	$video = preg_replace( '#(<source\b[^>]*?)\ssrc="([^"]*)"#i', '$1 data-__PREFIX__-src="$2"', $video );

	$GLOBALS['__PREFIX___videos'] = true;
	return $video;
}

/**
 * Blocks that can hold a <video>: html islands, video and cover blocks.
 *
 * @param string $html  Rendered block.
 * @param array  $block Block.
 * @return string
 */
function __PREFIX___videos( $html, $block ) {
	if ( false === stripos( $html, '<video' ) || ! in_array( $block['blockName'] ?? '', array( 'core/html', 'core/video', 'core/cover' ), true ) || ! __PREFIX___on( 'videos' ) ) {
		return $html;
	}
	return preg_replace_callback( '#<video\b[^>]*>.*?</video>#is', '__PREFIX___video', $html );
}
add_filter( 'render_block', '__PREFIX___videos', 10, 2 );

/* Third-party tags after the first interaction ----------------------------------------------- */

/**
 * Whether a script handle is held back (includes/site.php "delay": handle prefixes).
 *
 * @param string $handle Handle.
 * @return bool
 */
function __PREFIX___is_delayed( $handle ) {
	foreach ( (array) __PREFIX___site()['delay'] as $prefix ) {
		if ( '' !== $prefix && 0 === strpos( $handle, $prefix ) ) {
			return true;
		}
	}
	return false;
}

/**
 * A held-back script: type text/plain, its URL in data-__PREFIX__-src (assets/js/delay-tags.js runs it).
 *
 * @param string $tag    Script tags (with inline before/after).
 * @param string $handle Handle.
 * @return string
 */
function __PREFIX___delay_script( $tag, $handle ) {
	if ( ! __PREFIX___is_delayed( $handle ) || ! __PREFIX___on( 'delay_tags' ) ) {
		return $tag;
	}
	$GLOBALS['__PREFIX___delayed'] = true;
	return preg_replace_callback(
		'/<script\b([^>]*)\ssrc="([^"]*)"([^>]*)>/i',
		function ( $m ) {
			$attrs = preg_replace( '/\stype="[^"]*"/i', '', $m[1] . $m[3] );
			return '<script type="text/plain" data-__PREFIX__-delay data-__PREFIX__-src="' . $m[2] . '"' . $attrs . '>';
		},
		$tag
	);
}
add_filter( 'script_loader_tag', '__PREFIX___delay_script', 11, 2 );

/**
 * Inline before/after scripts of a held-back handle wait with it.
 *
 * @param array $attrs Attributes of the inline <script>.
 * @return array
 */
function __PREFIX___delay_inline( $attrs ) {
	if ( ! empty( $attrs['id'] ) && preg_match( '/^(.+)-js-(before|after)$/', $attrs['id'], $m ) && __PREFIX___is_delayed( $m[1] ) && __PREFIX___on( 'delay_tags' ) ) {
		$attrs['type']                  = 'text/plain';
		$attrs['data-__PREFIX__-delay'] = true;
	}
	return $attrs;
}
add_filter( 'wp_inline_script_attributes', '__PREFIX___delay_inline' );

/**
 * The small loaders, inline at the end of the page, only when they have work.
 */
function __PREFIX___print_loaders() {
	foreach ( array( '__PREFIX___videos' => 'videos.js', '__PREFIX___delayed' => 'delay-tags.js' ) as $flag => $file ) {
		if ( ! empty( $GLOBALS[ $flag ] ) ) {
			wp_print_inline_script_tag( (string) file_get_contents( __CONST___DIR . '/assets/js/' . $file ), array( 'id' => '__PREFIX__-' . basename( $file, '.js' ) ) );
		}
	}
}
add_action( 'wp_footer', '__PREFIX___print_loaders', 99 );

/* No browser caching of HTML ---------------------------------------------------------------------- */

/**
 * PHP-rendered pages say no-cache (with an Expires, so mod_expires leaves them alone): Pete Panel's
 * performance.conf gives everything without its own Expires a month in browsers.
 */
function __PREFIX___no_cache_headers() {
	if ( __PREFIX___on( 'html_no_cache' ) && ! headers_sent() ) {
		header( 'Cache-Control: no-cache, must-revalidate, max-age=0' );
		header( 'Expires: Thu, 01 Jan 1970 00:00:00 GMT' );
	}
}
add_action( 'send_headers', '__PREFIX___no_cache_headers', 99 );
