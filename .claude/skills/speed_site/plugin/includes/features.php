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
 * A root-relative URL ("/wp-content/themes/…", how pages whose content moved into the page itself
 * link the theme's files) made absolute, so it compares with the theme's URL.
 *
 * @param string $url URL.
 * @return string
 */
function __PREFIX___absolute_url( $url ) {
	$url = (string) $url;
	if ( 0 === strpos( $url, '/' ) && 0 !== strpos( $url, '//' ) ) {
		$home = wp_parse_url( home_url() );
		return ( $home['scheme'] ?? 'https' ) . '://' . ( $home['host'] ?? '' ) . ( isset( $home['port'] ) ? ':' . $home['port'] : '' ) . $url;
	}
	return $url;
}

/**
 * Theme file behind a theme URL ('' when the URL is not a file of the active theme).
 *
 * @param string $url URL.
 * @return string
 */
function __PREFIX___theme_file( $url ) {
	$url  = __PREFIX___absolute_url( strtok( (string) $url, '?#' ) );
	$base = get_stylesheet_directory_uri();
	if ( 0 !== strpos( $url, $base . '/' ) ) {
		return '';
	}
	$root = realpath( get_stylesheet_directory() );
	$file = realpath( $root . rawurldecode( substr( $url, strlen( $base ) ) ) );
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
			// The file's own type (a woff2 type on a .ttf is wrong; a type the browser lacks skips the preload).
			$type = array( 'woff2' => 'font/woff2', 'woff' => 'font/woff', 'ttf' => 'font/ttf', 'otf' => 'font/otf' )[ strtolower( pathinfo( $font, PATHINFO_EXTENSION ) ) ] ?? '';
			printf( '<link rel="preload" as="font"%s href="%s" crossorigin>' . "\n", $type ? ' type="' . $type . '"' : '', esc_url( $url ) );
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
		// An item for some widths only (media) is fetched by its preload there; boosting the <img>
		// would fetch it first at every width, ahead of the first screen's real element elsewhere.
		if ( $item['url'] === $src && '' === (string) ( $item['media'] ?? '' ) ) {
			$html = preg_replace( '/\s(loading|fetchpriority)="[^"]*"/i', '', $html );
			// WordPress gives lazy images sizes="auto, …"; on an eager image Chrome reads that as 100vw
			// and fetches a bigger copy than the preload's (two downloads of the first-screen photo).
			$html = preg_replace( '/(\ssizes=")auto,\s*/i', '$1', $html );
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
		// A quoted url() is matched whole, so a url() inside a data: URI (an SVG's filter='url(%23g)')
		// is never rewritten: quotes put into it would end the CSS string, and the whole declaration
		// with it (the grain buttons lost their background, 2026-10-16).
		'/url\(\s*(?:"([^"]*)"|\'([^\']*)\'|([^\'")\s]+))\s*\)/i',
		function ( $m ) use ( $dir ) {
			$url = trim( ( $m[1] ?? '' ) . ( $m[2] ?? '' ) . ( $m[3] ?? '' ) );
			if ( '' === $url || preg_match( '#^(data:|https?:|//|/|\#|%23)#i', $url ) ) {
				return $m[0];
			}
			return 'url("' . __PREFIX___resolve_url( $dir, $url ) . '")';
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
 * A theme photo's entry in variants.json ([ 'w', 'h', 'variants' ]), or null.
 *
 * @param string $url The theme photo's URL.
 * @return array|null
 */
function __PREFIX___variant_entry( $url ) {
	$base = get_stylesheet_directory_uri() . '/';
	$path = __PREFIX___absolute_url( strtok( (string) $url, '?#' ) );
	if ( 0 !== strpos( $path, $base ) ) {
		return null;
	}
	return __PREFIX___variants()[ rawurldecode( substr( $path, strlen( $base ) ) ) ] ?? null;
}

/**
 * The srcset of a theme photo: its copies, then the theme's own file ('' when it has no copies).
 *
 * @param string $url The theme photo's URL.
 * @return string
 */
function __PREFIX___srcset( $url ) {
	$entry = __PREFIX___variant_entry( $url );
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
 * The first class of a class attribute ('' for none): with its parent's, it names a photo's place.
 *
 * @param mixed $class Class attribute value.
 * @return string
 */
function __PREFIX___first_class( $class ) {
	return is_string( $class ) && preg_match( '/\S+/', $class, $m ) ? $m[0] : '';
}

/**
 * Theme photos get their copies as srcset, with the sizes measured for their place on this page
 * (includes/site.php "sizes"; "sizes_at" when the same photo shows at other widths elsewhere on the
 * page, by "<parent's first class>><its first class>"); a photo in a place not measured keeps its src
 * only. And they wait: a /reblock_site design's <img>s have no width and height, so WordPress
 * adds no loading="lazy" to them, and every photo of a page loads at once (9 MB on Ozone Polaris's
 * home page). Each theme photo but the logo gets loading="lazy" decoding="async"; the page's
 * first-screen image loses them again in __PREFIX___img_tag() (fetchpriority="high" instead), and photos in
 * a "load_together" element load all at once when it comes near (__PREFIX___print_load_together()).
 *
 * @param string $html  Rendered block.
 * @param array  $block Block.
 * @return string
 */
function __PREFIX___images( $html, $block ) {
	if ( ! in_array( $block['blockName'] ?? '', array( 'core/html', 'core/image' ), true ) || false === strpos( $html, '<img' ) || ! __PREFIX___on( 'images' ) ) {
		return $html;
	}
	$page  = __PREFIX___page_key();
	$sizes = __PREFIX___site()['sizes'][ $page ] ?? array();
	$at    = __PREFIX___site()['sizes_at'][ $page ] ?? array();
	$theme = get_stylesheet_directory_uri() . '/';
	$void  = array( 'AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'INPUT', 'LINK', 'META', 'SOURCE', 'TRACK', 'WBR' );
	$open  = array(); // [ tag, first class ] of each open element, outermost first.
	$tags  = new WP_HTML_Tag_Processor( $html );
	while ( $tags->next_tag( array( 'tag_closers' => 'visit' ) ) ) {
		$name = $tags->get_tag();
		if ( $tags->is_tag_closer() ) {
			for ( $i = count( $open ) - 1; $i >= 0; $i-- ) {
				if ( $open[ $i ][0] === $name ) {
					array_splice( $open, $i );
					break;
				}
			}
			continue;
		}
		if ( 'IMG' !== $name ) {
			if ( ! in_array( $name, $void, true ) ) {
				$open[] = array( $name, __PREFIX___first_class( $tags->get_attribute( 'class' ) ) );
			}
			continue;
		}
		$url = $tags->get_attribute( 'src' );
		if ( ! is_string( $url ) || 0 !== strpos( __PREFIX___absolute_url( $url ), $theme ) ) {
			continue;
		}
		$file = basename( (string) strtok( $url, '?#' ) );
		$set  = null === $tags->get_attribute( 'srcset' ) && isset( $sizes[ $file ] ) ? __PREFIX___srcset( $url ) : '';
		if ( $set ) {
			// Its place's sizes. A parent outside this block's markup (a group's wrapper) is unknown here:
			// then the one place of this photo with the same class of its own, if only one has it.
			$own = '>' . __PREFIX___first_class( $tags->get_attribute( 'class' ) );
			if ( $open ) {
				$size = $at[ $file ][ end( $open )[1] . $own ] ?? null;
			} else {
				$same = array_filter(
					$at[ $file ] ?? array(),
					function ( $key ) use ( $own ) {
						return substr( $key, -strlen( $own ) ) === $own;
					},
					ARRAY_FILTER_USE_KEY
				);
				$size = 1 === count( $same ) ? reset( $same ) : null;
			}
			$tags->set_attribute( 'srcset', $set );
			$tags->set_attribute( 'sizes', $size ?? $sizes[ $file ] );
			// The original's aspect ratio, whichever copy loads (__PREFIX___print_ratio_rule()).
			$entry = __PREFIX___variant_entry( $url );
			$style = $tags->get_attribute( 'style' );
			$tags->set_attribute( 'style', '--__PREFIX__-ar:' . (int) $entry['w'] . '/' . (int) $entry['h'] . ';' . ( is_string( $style ) ? $style : '' ) );
		}
		if ( false === stripos( $file, 'logo' ) && null === $tags->get_attribute( 'loading' ) ) {
			$tags->set_attribute( 'loading', 'lazy' );
			$tags->set_attribute( 'decoding', 'async' );
		}
	}
	return $tags->get_updated_html();
}
add_filter( 'render_block', '__PREFIX___images', 10, 2 );

/**
 * A copy's height is a whole number of pixels, so its aspect ratio can't always be the original's
 * (1073 x 628 has no smaller exact copy). Where a photo's height follows its width, the layout then
 * moves by a fraction of a pixel, enough to put text below it 1 px higher (Ozone Polaris,
 * 2026-10-16). Each photo with copies carries the original's ratio and this rule applies it. :where()
 * gives it no specificity: any aspect-ratio of the design's own still wins.
 */
function __PREFIX___print_ratio_rule() {
	if ( __PREFIX___on( 'images' ) ) {
		echo '<style id="__PREFIX__-ratio">:where(img[style*="--__PREFIX__-ar"]){aspect-ratio:var(--__PREFIX__-ar)}</style>' . "\n";
	}
}
add_action( 'wp_head', '__PREFIX___print_ratio_rule', 2 );

/**
 * Photos in a "load_together" element (includes/site.php) all start loading once it comes within
 * 1250 px of the screen. A marquee moves its photos into view sideways inside a clipped strip, where
 * each lazy photo would start only as it enters the strip, and slide in blank; eager, they cost Ozone
 * Polaris's first screen 320 KB on phones (2026-10-16).
 */
function __PREFIX___print_load_together() {
	$classes = __PREFIX___site()['load_together'] ?? array();
	if ( ! $classes || ! __PREFIX___on( 'images' ) ) {
		return;
	}
	$selector = implode( ',', array_map( function ( $c ) {
		return '.' . $c;
	}, $classes ) );
	printf(
		"<script id=\"__PREFIX__-together\">(function(){var els=document.querySelectorAll(%s),go=function(el){el.querySelectorAll('img[loading=lazy]').forEach(function(i){i.loading='eager';});};if(!('IntersectionObserver' in window)){els.forEach(go);return;}var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);go(e.target);}});},{rootMargin:'1250px 0px'});els.forEach(function(el){io.observe(el);});})();</script>\n",
		wp_json_encode( $selector )
	);
}
add_action( 'wp_footer', '__PREFIX___print_load_together', 99 );

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
