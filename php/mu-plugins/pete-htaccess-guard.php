<?php
/**
 * Plugin Name: Pete — .htaccess guard
 * Description: Stops WP Fastest Cache from rewriting .htaccess on every user
 *   registration / profile update, and self-heals .htaccess if anything ever
 *   empties it. Leaves the file fully writable so Pete Panel and WordPress can
 *   manage it normally.
 * Version: 1.0
 *
 * Why this exists
 * ---------------
 * WP Fastest Cache (<= 1.4.9) hooks user_register and profile_update to
 * modify_htaccess_for_new_user(), which does an UNLOCKED read-modify-write:
 *
 *     $h = @file_get_contents(ABSPATH . '.htaccess');   // result never checked
 *     ... optional regex replace ...
 *     @file_put_contents(ABSPATH . '.htaccess', $h);    // no LOCK_EX
 *
 * file_put_contents truncates before writing, so two concurrent registrations
 * interleave as: A truncates -> B reads "" -> A writes -> B writes "".
 * The empty read is written straight back, so the 0-byte state persists and
 * Apache loses the rewrite rules: every pretty permalink 404s while cached
 * pages keep serving 200 (which is why uptime checks on "/" miss it).
 *
 * Observed on staging.deploypete.com 2026-07-20 at ~3.3 registrations/sec.
 * Any store that registers customers at checkout can hit this under a traffic
 * spike — it needs concurrency, not a load test.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 1) Unhook the racy writer.
 *
 * Trade-off: WPFC's "exclude admin cookie" rules stop auto-refreshing when an
 * administrator is added or renamed. Re-save WP Fastest Cache settings on those
 * rare occasions to regenerate them.
 */
add_action(
	'init',
	static function () {
		$wpfc = isset( $GLOBALS['wp_fastest_cache'] ) ? $GLOBALS['wp_fastest_cache'] : null;

		if ( is_object( $wpfc ) && method_exists( $wpfc, 'modify_htaccess_for_new_user' ) ) {
			remove_action( 'user_register', array( $wpfc, 'modify_htaccess_for_new_user' ), 10 );
			remove_action( 'profile_update', array( $wpfc, 'modify_htaccess_for_new_user' ), 10 );
		}
	},
	1
);

/**
 * 2) Self-heal, as a backstop against any other plugin doing the same thing.
 *
 * Keeps a known-good copy that tracks the newest healthy version of the live
 * file, so legitimate edits by Pete Panel or WordPress are preserved. Restores
 * only when the live file is empty or missing — never overwrites valid content.
 *
 * Cost on a normal request: one filesize() stat.
 */
add_action(
	'shutdown',
	static function () {
		$live = ABSPATH . '.htaccess';
		$good = WP_CONTENT_DIR . '/.htaccess-known-good';

		$live_size = @filesize( $live );

		// Healthy: refresh the known-good copy when the live file has changed.
		if ( false !== $live_size && $live_size > 0 ) {
			$good_size = @filesize( $good );

			if ( $good_size !== $live_size || @filemtime( $live ) > (int) @filemtime( $good ) ) {
				$content = @file_get_contents( $live );

				// Only trust a copy that still contains WordPress's rewrite block.
				if ( is_string( $content ) && false !== strpos( $content, 'BEGIN WordPress' ) ) {
					@file_put_contents( $good, $content, LOCK_EX );
				}
			}

			return;
		}

		// Empty or missing: restore from the known-good copy.
		$backup = @file_get_contents( $good );

		if ( is_string( $backup ) && '' !== $backup ) {
			@file_put_contents( $live, $backup, LOCK_EX );
			error_log( '[pete-htaccess-guard] .htaccess was empty or missing; restored from known-good copy' );
		}
	},
	PHP_INT_MAX
);
