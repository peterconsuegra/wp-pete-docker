<?php
/**
 * Settings > Page Speed: one checkbox per feature, and what the plugin sees on this site. Saving
 * empties the page cache.
 *
 * @package __SLUG__
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the option.
 */
function __PREFIX___admin_init() {
	register_setting(
		'__OPTION__',
		'__OPTION__',
		array(
			'type'              => 'array',
			'sanitize_callback' => '__PREFIX___sanitize',
			'default'           => array(),
		)
	);
}
add_action( 'admin_init', '__PREFIX___admin_init' );

/**
 * Settings menu entry.
 */
function __PREFIX___admin_menu() {
	add_options_page( 'Page Speed', 'Page Speed', 'manage_options', '__SLUG__', '__PREFIX___settings_page' );
}
add_action( 'admin_menu', '__PREFIX___admin_menu' );

/**
 * Every feature saved as 0 or 1 (an unchecked box is not posted at all).
 *
 * @param mixed $input Posted values.
 * @return array
 */
function __PREFIX___sanitize( $input ) {
	$out = array();
	foreach ( array_keys( __PREFIX___features() ) as $key ) {
		$out[ $key ] = empty( $input[ $key ] ) ? 0 : 1;
	}
	return $out;
}
add_action( 'add_option___OPTION__', '__PREFIX___purge_cache' );
add_action( 'update_option___OPTION__', '__PREFIX___purge_cache' );

/**
 * Settings link on the Plugins screen.
 *
 * @param array $links Links.
 * @return array
 */
function __PREFIX___action_links( $links ) {
	array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=__SLUG__' ) ) . '">Settings</a>' );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __CONST___DIR . '/__SLUG__.php' ), '__PREFIX___action_links' );

/**
 * The page.
 */
function __PREFIX___settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$saved = get_option( '__OPTION__', array() );
	$site  = __PREFIX___site();
	$wpfc  = get_option( 'WpFastestCache' );
	$wpfc  = $wpfc ? json_decode( $wpfc, true ) : array();
	?>
	<div class="wrap">
		<h1>Page Speed</h1>
		<p>__SITE__'s Core Web Vitals features. Saving empties the page cache.</p>
		<form method="post" action="options.php">
			<?php settings_fields( '__OPTION__' ); ?>
			<table class="form-table" role="presentation">
				<?php
				foreach ( __PREFIX___features() as $key => $feature ) :
					$on = isset( $saved[ $key ] ) ? (bool) $saved[ $key ] : (bool) $feature['default'];
					?>
				<tr>
					<th scope="row"><?php echo esc_html( $feature['label'] ); ?></th>
					<td>
						<label><input type="checkbox" name="__OPTION__[<?php echo esc_attr( $key ); ?>]" value="1" <?php checked( $on ); ?>> On</label>
						<p class="description"><?php echo esc_html( $feature['help'] ); ?></p>
					</td>
				</tr>
				<?php endforeach; ?>
			</table>
			<?php submit_button(); ?>
		</form>

		<h2>On this site</h2>
		<ul style="list-style:disc;padding-left:20px">
			<li>Theme <code><?php echo esc_html( get_stylesheet() ); ?></code>: <?php echo $site['theme'] === get_stylesheet() ? 'the one this plugin was made for' : '<strong>not ' . esc_html( $site['theme'] ) . ': every feature is off</strong>'; ?>.</li>
			<li>Reblock Page Speed: <?php echo function_exists( 'rps_on' ) ? '<strong>active: deactivate it, this plugin stays off while it runs</strong>' : 'not active'; ?>.</li>
			<li>Pages with first-screen hints: <code><?php echo esc_html( implode( ', ', array_keys( (array) $site['pages'] ) ) ? implode( ', ', array_keys( (array) $site['pages'] ) ) : 'none' ); ?></code>; photo copies: <?php echo esc_html( (string) count( __PREFIX___variants() ) ); ?> photos.</li>
			<?php if ( $site['delay'] ) : ?>
			<li>Scripts held back until the first interaction: <code><?php echo esc_html( implode( ', ', (array) $site['delay'] ) ); ?></code>.</li>
			<?php endif; ?>
			<li>WP Fastest Cache: <?php echo isset( $GLOBALS['wp_fastest_cache'] ) ? ( ! empty( $wpfc['wpFastestCacheStatus'] ) ? 'active, page cache on' : '<strong>active, page cache off</strong>' ) : '<strong>not active</strong>'; ?>.</li>
		</ul>
	</div>
	<?php
}

/**
 * Plugins screen: say so while the shared plugin would keep this one off.
 */
function __PREFIX___admin_notice() {
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
	if ( $screen && in_array( $screen->id, array( 'plugins', 'settings_page___SLUG__' ), true ) && function_exists( 'rps_on' ) && current_user_can( 'activate_plugins' ) ) {
		echo '<div class="notice notice-warning"><p>__NAME__ stays off while Reblock Page Speed is active. Deactivate Reblock Page Speed.</p></div>';
	}
}
add_action( 'admin_notices', '__PREFIX___admin_notice' );
