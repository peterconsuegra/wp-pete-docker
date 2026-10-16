<?php
/**
 * What __SITE__ needs. scaffold_plugin.py writes this file from the probes of the dev site
 * (lcpprobe.mjs, imgwidths.mjs); /speed_site then checks it against Lighthouse. The only file with
 * site data: features.php reads it.
 *
 *   theme        The theme this plugin was made for. With another theme active, every feature is off.
 *   fonts        Font files (theme-relative) every page's first screen uses: preloaded on every page.
 *   pages        Page key ("home", a page's path such as "about" or "parent/child", "post" for single
 *                posts) => [ 'lcp' => [ items ], 'fonts' => [ files ] ]. An lcp item is
 *                [ 'class' => …, 'media' => … ] (the first element with that class while the page
 *                renders: an <img> with its srcset, a <video>'s poster, or the first <img> inside),
 *                [ 'image' => theme-relative path or URL ] or [ 'featured' => true ].
 *   sizes        Page key => photo file name => the sizes attribute of that photo there (measured).
 *   sizes_at     Page key => photo file name => place => sizes, where the same photo shows at other
 *                widths elsewhere on that page; a place is "<parent's first class>><its first class>".
 *                Other places of that photo take "sizes" (its widest place).
 *   load_together  Classes whose photos all start loading when the element comes near the screen
 *                (the images feature): a marquee moves its photos into view sideways, inside a clipped
 *                strip, where each lazy photo would start only as it enters the strip and slide in blank.
 *   keep_poster  Class of the video whose poster shows at once ('' = the first video of each page).
 *                Every other poster waits with its video.
 *   delay        Script handle prefixes held back until the first interaction. Empty: no such feature.
 *
 * @package __SLUG__
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The site's data.
 *
 * @return array
 */
function __PREFIX___site() {
	return array(
		'theme'       => '__THEME__',
		'fonts'       => array(),
		'pages'       => array(),
		'sizes'       => array(),
		'sizes_at'    => array(),
		'load_together' => array(),
		'keep_poster' => '',
		'delay'       => array(),
	);
}
