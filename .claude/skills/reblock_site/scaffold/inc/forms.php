<?php
/**
 * Optional backend for the design's forms (newsletter, contact). Off until functions.php has
 * require_once __DIR__ . '/inc/forms.php';  (the owner picks it at the decisions gate).
 *
 * In the pattern, the design's <form> keeps its markup and gets:
 *   method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"
 *   <?php __PREFIX___form_fields( 'newsletter' ); ?>   (inside the form)
 * Each entry becomes a private "Form entry" post (wp-admin > Form entries) and an email to the
 * site's admin address. The visitor returns to the page with ?sent=<form> (or ?sent=error), so the
 * design's thank-you note can show; a fetch() POST with __PREFIX___ajax=1 gets JSON instead.
 * No nonce on purpose: pages are cached, and a nonce in a cached page expires within a day.
 * Bots are caught by the honeypot field. Define __PREFIXUC___FORMS_NO_MAIL as true on dev copies.
 *
 * @package __SLUG__
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'init',
	function () {
		register_post_type(
			'__PREFIX___entry',
			array(
				'labels'       => array(
					'name'          => 'Form entries',
					'singular_name' => 'Form entry',
				),
				'public'       => false,
				'show_ui'      => true,
				'menu_icon'    => 'dashicons-email',
				'supports'     => array( 'title', 'editor', 'custom-fields' ),
				'capabilities' => array( 'create_posts' => 'do_not_allow' ),
				'map_meta_cap' => true,
			)
		);
	}
);

/**
 * Hidden fields for one form: the handler, the form's name, the page to return to and the honeypot.
 *
 * @param string $form Form name (letters, digits, dashes).
 */
function __PREFIX___form_fields( $form ) {
	$back = isset( $_SERVER['HTTP_HOST'], $_SERVER['REQUEST_URI'] )
		? set_url_scheme( 'http://' . sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) . esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) )
		: home_url( '/' );
	printf(
		'<input type="hidden" name="action" value="__PREFIX___form"><input type="hidden" name="__PREFIX___form" value="%1$s"><input type="hidden" name="__PREFIX___back" value="%2$s"><span style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true"><input type="text" name="__PREFIX___hp" tabindex="-1" autocomplete="off"></span>',
		esc_attr( $form ),
		esc_url( remove_query_arg( 'sent', $back ) )
	);
}

/**
 * Store and email one submission, then send the visitor back (or answer JSON).
 */
function __PREFIX___handle_form() {
	// phpcs:disable WordPress.Security.NonceVerification.Missing -- public form on cached pages, see the file header.
	$form = isset( $_POST['__PREFIX___form'] ) ? sanitize_key( wp_unslash( $_POST['__PREFIX___form'] ) ) : '';
	$back = isset( $_POST['__PREFIX___back'] ) ? wp_validate_redirect( esc_url_raw( wp_unslash( $_POST['__PREFIX___back'] ) ), home_url( '/' ) ) : home_url( '/' );
	$ajax = ! empty( $_POST['__PREFIX___ajax'] );
	$done = function ( $ok, $message = '' ) use ( $form, $back, $ajax ) {
		if ( $ajax ) {
			$ok ? wp_send_json_success() : wp_send_json_error( $message, 400 );
		}
		wp_safe_redirect( add_query_arg( 'sent', $ok ? $form : 'error', $back ) );
		exit;
	};
	if ( '' === $form ) {
		$done( false, 'unknown form' );
	}
	if ( ! empty( $_POST['__PREFIX___hp'] ) ) {
		$done( true ); // A bot filled the honeypot: pretend it worked, store nothing.
	}
	$fields = array();
	foreach ( $_POST as $key => $value ) {
		if ( is_array( $value ) || 0 === strpos( $key, '__PREFIX___' ) || in_array( $key, array( 'action', '_wp_http_referer' ), true ) ) {
			continue;
		}
		$fields[ sanitize_key( $key ) ] = sanitize_textarea_field( wp_unslash( $value ) );
	}
	// phpcs:enable
	if ( isset( $fields['email'] ) && ! is_email( $fields['email'] ) ) {
		$done( false, 'invalid email' );
	}
	$lines = array();
	foreach ( $fields as $key => $value ) {
		$lines[] = $key . ': ' . $value;
	}
	$id = wp_insert_post(
		array(
			'post_type'    => '__PREFIX___entry',
			'post_status'  => 'private',
			'post_title'   => $form . ': ' . ( $fields['email'] ?? ( $fields['name'] ?? gmdate( 'Y-m-d H:i' ) ) ),
			'post_content' => implode( "\n", $lines ) . "\n\npage: " . $back,
		)
	);
	if ( ! $id || is_wp_error( $id ) ) {
		$done( false, 'not saved' );
	}
	foreach ( $fields as $key => $value ) {
		update_post_meta( $id, $key, $value );
	}
	if ( ! ( defined( '__PREFIXUC___FORMS_NO_MAIL' ) && constant( '__PREFIXUC___FORMS_NO_MAIL' ) ) ) {
		wp_mail( get_option( 'admin_email' ), '[' . get_bloginfo( 'name' ) . '] ' . $form, implode( "\n", $lines ) . "\n\n" . $back );
	}
	$done( true );
}
add_action( 'admin_post_nopriv___PREFIX___form', '__PREFIX___handle_form' );
add_action( 'admin_post___PREFIX___form', '__PREFIX___handle_form' );
