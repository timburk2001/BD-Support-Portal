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
		try {
			error_log( '[SupportPortal] handle_submit called — ' . $request->get_method() . ' ' . $request->get_route() );

			// ── 1. Verify WordPress REST nonce (CSRF protection for all users) ──
			$nonce = $request->get_header( 'X-WP-Nonce' );
			if ( ! $nonce || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
				error_log( '[SupportPortal] nonce check failed — nonce present: ' . ( $nonce ? 'yes' : 'no' ) );
				return new WP_Error(
					'rest_forbidden',
					__( 'Invalid or missing nonce.', 'support-portal' ),
					array( 'status' => 403 )
				);
			}
			error_log( '[SupportPortal] nonce OK' );

			// ── 2. Confirm plugin is configured ────────────────────────────────
			$settings = Support_Portal_Settings::get_settings();
			$api_url  = $settings['api_url'];
			$api_key  = Support_Portal_Settings::decrypt_key( $settings['api_key'] );

			if ( empty( $api_url ) ) {
				error_log( '[SupportPortal] misconfigured — API URL is empty' );
				return new WP_Error(
					'misconfigured',
					__( 'Support Portal: Portal API URL is not configured. Go to Settings → Support Portal and add the URL.', 'support-portal' ),
					array( 'status' => 500 )
				);
			}

			if ( empty( $api_key ) ) {
				error_log( '[SupportPortal] misconfigured — API key is empty (stored value: ' . ( empty( $settings['api_key'] ) ? 'not set' : 'set but decrypts to empty' ) . ')' );
				return new WP_Error(
					'misconfigured',
					__( 'Support Portal: API Key is not configured. Go to Settings → Support Portal and add the key.', 'support-portal' ),
					array( 'status' => 500 )
				);
			}

			error_log( '[SupportPortal] config OK — posting to: ' . $api_url );

			// ── 3. Parse request body ───────────────────────────────────────────
			$body = $request->get_json_params();
			if ( ! is_array( $body ) ) {
				error_log( '[SupportPortal] bad request — body is not a JSON object (raw length: ' . strlen( $request->get_body() ) . ')' );
				return new WP_Error(
					'bad_request',
					__( 'Invalid JSON body.', 'support-portal' ),
					array( 'status' => 400 )
				);
			}

			// Log field presence (never log the screenshot itself — too large).
			error_log( sprintf(
				'[SupportPortal] body fields: title=%s description=%s email=%s name=%s page_url=%s screenshot=%s',
				isset( $body['title'] )               ? 'yes' : 'no',
				isset( $body['description'] )          ? 'yes' : 'no',
				isset( $body['submitter_email'] )      ? 'yes' : 'no',
				isset( $body['submitter_name'] )       ? 'yes' : 'no',
				isset( $body['page_url'] )             ? 'yes' : 'no',
				isset( $body['annotated_screenshot'] ) ? 'yes (' . strlen( $body['annotated_screenshot'] ) . ' chars)' : 'no'
			) );

			// ── 3b. Decode reply_to_email (plugin base64-encodes it to avoid
			//        host WAF rules that block multiple email addresses in POST body) ──
			if ( ! empty( $body['reply_to_email'] ) ) {
				$decoded = base64_decode( $body['reply_to_email'], /* strict= */ true );
				if ( false !== $decoded && filter_var( $decoded, FILTER_VALIDATE_EMAIL ) ) {
					$body['reply_to_email'] = $decoded;
					error_log( '[SupportPortal] decoded reply_to_email from base64' );
				}
			}

			// ── 4. Forward to portal API ────────────────────────────────────────
			$encoded = wp_json_encode( $body );
			if ( false === $encoded ) {
				error_log( '[SupportPortal] wp_json_encode failed — body could not be serialised' );
				return new WP_Error(
					'encode_error',
					__( 'Support Portal: Failed to encode the request body.', 'support-portal' ),
					array( 'status' => 500 )
				);
			}

			error_log( '[SupportPortal] encoded payload size: ' . strlen( $encoded ) . ' bytes' );

			$response = wp_remote_post(
				$api_url,
				array(
					'headers'   => array(
						'Content-Type' => 'application/json',
						'x-api-key'    => $api_key,
					),
					'body'      => $encoded,
					'timeout'   => 45,
					// sslverify: false — many managed WP hosts ship outdated CA bundles
					// that fail to verify Vercel/Let's Encrypt certs. The x-api-key header
					// still authenticates every request; this only affects cert-chain trust.
					'sslverify' => false,
				)
			);

			// ── 5. Handle transport-level errors (DNS failure, timeout, etc.) ───
			if ( is_wp_error( $response ) ) {
				$msg = $response->get_error_message();
				error_log( '[SupportPortal] wp_remote_post transport error: ' . $msg );
				return new WP_Error(
					'upstream_error',
					sprintf( __( 'Support Portal: Could not reach the portal API (%s).', 'support-portal' ), $msg ),
					array( 'status' => 502 )
				);
			}

			// ── 6. Log and return upstream response ─────────────────────────────
			$http_code     = (int) wp_remote_retrieve_response_code( $response );
			$upstream_body = wp_remote_retrieve_body( $response );

			// Truncate large bodies in the log (screenshots can be megabytes).
			$log_body = strlen( $upstream_body ) > 500
				? substr( $upstream_body, 0, 500 ) . '… [truncated, total ' . strlen( $upstream_body ) . ' bytes]'
				: $upstream_body;

			error_log( '[SupportPortal] upstream response — HTTP ' . $http_code . ' — body: ' . $log_body );

			$data = json_decode( $upstream_body, true );
			if ( ! is_array( $data ) ) {
				$data = array( 'raw' => $upstream_body );
			}

			// Surface upstream errors as WP_Error so the JS fetch sees a non-2xx
			// status and displays the portal's own error message.
			if ( $http_code >= 400 ) {
				$upstream_message = isset( $data['error'] ) ? $data['error']
					: ( isset( $data['message'] ) ? $data['message']
					: 'Portal returned HTTP ' . $http_code );

				error_log( '[SupportPortal] upstream error: ' . $upstream_message );

				return new WP_Error(
					'upstream_' . $http_code,
					$upstream_message,
					array( 'status' => $http_code >= 500 ? 502 : $http_code )
				);
			}

			return new WP_REST_Response( $data, $http_code );

		} catch ( Throwable $e ) {
			error_log( '[SupportPortal] uncaught exception in handle_submit: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() );
			return new WP_Error(
				'internal_error',
				sprintf( __( 'Support Portal internal error: %s', 'support-portal' ), $e->getMessage() ),
				array( 'status' => 500 )
			);
		}
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

		// Screenshots are captured via the browser's native Screen Capture API
		// (getDisplayMedia) — no html2canvas dependency needed.
		wp_enqueue_script(
			'support-portal-markup',
			SUPPORT_PORTAL_URL . 'assets/js/markup-canvas.js',
			array(),
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
		// Force https:// on the REST URL. WordPress home_url may be configured
		// as http://, which would cause browsers to follow a 301 redirect and
		// silently downgrade POST → GET (RFC 7231), making the route 404.
		wp_localize_script(
			'support-portal',
			'SupportPortalConfig',
			array(
				'restUrl'        => esc_url_raw( set_url_scheme( rest_url( 'support-portal/v1/submit' ), 'https' ) ),
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
