<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Support_Portal_Ingest {

	public function __construct() {
		add_action( 'rest_api_init',     array( $this, 'register_routes' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'maybe_enqueue' ) );
	}

	// ── REST route ──────────────────────────────────────────────────────────────

	public function register_routes() {
		register_rest_route(
			'support-portal/v1',
			'/submit',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle_submit' ),
				// Nonce is verified inside the callback; open to all users
				// (logged-in and out) because the button visibility controls who sees it.
				'permission_callback' => '__return_true',
			)
		);
	}

	public function handle_submit( WP_REST_Request $request ) {
		// ── 1. Verify WordPress REST nonce (CSRF protection for all users) ────
		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new WP_Error( 'rest_forbidden', __( 'Invalid or missing nonce.', 'support-portal' ), array( 'status' => 403 ) );
		}

		// ── 2. Retrieve portal config (API key never sent to client) ──────────
		$settings = Support_Portal_Settings::get_settings();
		$api_url  = $settings['api_url'];
		$api_key  = Support_Portal_Settings::decrypt_key( $settings['api_key'] );

		if ( empty( $api_url ) || empty( $api_key ) ) {
			return new WP_Error(
				'misconfigured',
				__( 'The Support Portal plugin is not configured. Please set the API URL and Key under Settings → Support Portal.', 'support-portal' ),
				array( 'status' => 500 )
			);
		}

		// ── 3. Parse and forward request body ─────────────────────────────────
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			return new WP_Error( 'bad_request', __( 'Invalid JSON body.', 'support-portal' ), array( 'status' => 400 ) );
		}

		$response = wp_remote_post(
			$api_url,
			array(
				'headers'   => array(
					'Content-Type' => 'application/json',
					'x-api-key'    => $api_key,
				),
				'body'      => wp_json_encode( $body ),
				'timeout'   => 30,
				'sslverify' => true,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'upstream_error',
				$response->get_error_message(),
				array( 'status' => 502 )
			);
		}

		$http_code     = (int) wp_remote_retrieve_response_code( $response );
		$upstream_body = wp_remote_retrieve_body( $response );
		$data          = json_decode( $upstream_body, true );

		if ( ! is_array( $data ) ) {
			$data = array( 'raw' => $upstream_body );
		}

		return new WP_REST_Response( $data, $http_code );
	}

	// ── Asset enqueueing ────────────────────────────────────────────────────────

	public function maybe_enqueue() {
		$settings = Support_Portal_Settings::get_settings();

		if ( ! $this->user_can_see( $settings['show_to'] ) ) {
			return;
		}

		if ( empty( $settings['api_url'] ) || empty( $settings['api_key'] ) ) {
			return;
		}

		$vendor_file = SUPPORT_PORTAL_PATH . 'assets/vendor/html2canvas.min.js';
		if ( ! file_exists( $vendor_file ) ) {
			return;
		}

		wp_enqueue_script(
			'html2canvas',
			SUPPORT_PORTAL_URL . 'assets/vendor/html2canvas.min.js',
			array(),
			'1.4.1',
			true
		);

		wp_enqueue_script(
			'support-portal-markup',
			SUPPORT_PORTAL_URL . 'assets/js/markup-canvas.js',
			array( 'html2canvas' ),
			SUPPORT_PORTAL_VERSION,
			true
		);

		wp_enqueue_script(
			'support-portal',
			SUPPORT_PORTAL_URL . 'assets/js/support-portal.js',
			array( 'support-portal-markup' ),
			SUPPORT_PORTAL_VERSION,
			true
		);

		wp_enqueue_style(
			'support-portal',
			SUPPORT_PORTAL_URL . 'assets/css/support-portal.css',
			array(),
			SUPPORT_PORTAL_VERSION
		);

		// Config object is localized — API key is NOT included here.
		wp_localize_script(
			'support-portal',
			'SupportPortalConfig',
			array(
				'restUrl'        => esc_url_raw( rest_url( 'support-portal/v1/submit' ) ),
				'nonce'          => wp_create_nonce( 'wp_rest' ),
				'buttonText'     => $settings['button_text'],
				'buttonPosition' => $settings['button_position'],
				'currentUser'    => $this->current_user_data(),
			)
		);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────────

	private function user_can_see( $show_to ) {
		switch ( $show_to ) {
			case 'admins':
				return current_user_can( 'manage_options' );
			case 'logged_in':
				return is_user_logged_in();
			default:
				return true;
		}
	}

	private function current_user_data() {
		if ( ! is_user_logged_in() ) {
			return null;
		}
		$user = wp_get_current_user();
		return array(
			'name'  => $user->display_name,
			'email' => $user->user_email,
		);
	}
}
