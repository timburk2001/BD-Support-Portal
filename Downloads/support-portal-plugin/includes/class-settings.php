<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Support_Portal_Settings {

	const OPTION_NAME = 'support_portal_settings';

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_init', array( $this, 'handle_save' ) );
	}

	public function add_menu() {
		add_options_page(
			esc_html__( 'Support Portal', 'support-portal' ),
			esc_html__( 'Support Portal', 'support-portal' ),
			'manage_options',
			'support-portal',
			array( $this, 'render_page' )
		);
	}

	// ── Public helpers ──────────────────────────────────────────────────────────

	public static function get_settings() {
		$defaults = array(
			'api_url'         => '',
			'api_key'         => '',  // stored base64-encoded
			'show_to'         => 'all',
			'button_position' => 'bottom-right',
			'button_text'     => 'Report an issue',
		);
		$saved = get_option( self::OPTION_NAME, array() );
		return array_merge( $defaults, (array) $saved );
	}

	public static function decrypt_key( $encoded ) {
		if ( empty( $encoded ) ) {
			return '';
		}
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		return (string) base64_decode( $encoded, true );
	}

	// ── Settings save ───────────────────────────────────────────────────────────

	public function handle_save() {
		if ( ! isset( $_POST['_sp_nonce'] ) ) {
			return;
		}

		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['_sp_nonce'] ) ), 'support_portal_save' ) ) {
			wp_die( esc_html__( 'Security check failed.', 'support-portal' ) );
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'support-portal' ) );
		}

		$current = self::get_settings();

		// API key: only replace when a new value is entered.
		$raw_key      = isset( $_POST['api_key_input'] ) ? sanitize_text_field( wp_unslash( $_POST['api_key_input'] ) ) : '';
		$stored_key   = ( '' !== $raw_key )
			// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
			? base64_encode( $raw_key )
			: $current['api_key'];

		$allowed_show_to   = array( 'all', 'logged_in', 'admins' );
		$allowed_positions = array( 'bottom-right', 'bottom-left' );

		$show_to   = isset( $_POST['show_to'] ) ? sanitize_text_field( wp_unslash( $_POST['show_to'] ) ) : 'all';
		$position  = isset( $_POST['button_position'] ) ? sanitize_text_field( wp_unslash( $_POST['button_position'] ) ) : 'bottom-right';

		$settings = array(
			'api_url'         => isset( $_POST['api_url'] ) ? esc_url_raw( wp_unslash( $_POST['api_url'] ) ) : '',
			'api_key'         => $stored_key,
			'show_to'         => in_array( $show_to, $allowed_show_to, true ) ? $show_to : 'all',
			'button_position' => in_array( $position, $allowed_positions, true ) ? $position : 'bottom-right',
			'button_text'     => isset( $_POST['button_text'] ) ? sanitize_text_field( wp_unslash( $_POST['button_text'] ) ) : 'Report an issue',
		);

		update_option( self::OPTION_NAME, $settings );

		wp_safe_redirect(
			add_query_arg( 'sp_saved', '1', admin_url( 'options-general.php?page=support-portal' ) )
		);
		exit;
	}

	// ── Render ──────────────────────────────────────────────────────────────────

	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$s = self::get_settings();

		if ( isset( $_GET['sp_saved'] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>'
				. esc_html__( 'Settings saved.', 'support-portal' )
				. '</p></div>';
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Support Portal Settings', 'support-portal' ); ?></h1>
			<form method="post" action="">
				<?php wp_nonce_field( 'support_portal_save', '_sp_nonce' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">
							<label for="sp_api_url"><?php esc_html_e( 'Portal API URL', 'support-portal' ); ?></label>
						</th>
						<td>
							<input type="url" id="sp_api_url" name="api_url" class="regular-text"
								value="<?php echo esc_attr( $s['api_url'] ); ?>" />
							<p class="description"><?php esc_html_e( 'e.g. https://support.youragency.com/api/tickets/ingest', 'support-portal' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="sp_api_key"><?php esc_html_e( 'API Key', 'support-portal' ); ?></label>
						</th>
						<td>
							<input type="password" id="sp_api_key" name="api_key_input" class="regular-text"
								placeholder="<?php echo ! empty( $s['api_key'] ) ? esc_attr( $this->key_preview( $s['api_key'] ) ) : esc_attr__( 'Paste API key here', 'support-portal' ); ?>"
								autocomplete="new-password" />
							<?php if ( ! empty( $s['api_key'] ) ) : ?>
								<p class="description"><?php esc_html_e( 'Leave blank to keep the existing key.', 'support-portal' ); ?></p>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Show button to', 'support-portal' ); ?></th>
						<td>
							<select name="show_to" id="sp_show_to">
								<option value="all"       <?php selected( $s['show_to'], 'all' ); ?>><?php esc_html_e( 'All visitors', 'support-portal' ); ?></option>
								<option value="logged_in" <?php selected( $s['show_to'], 'logged_in' ); ?>><?php esc_html_e( 'Logged-in users only', 'support-portal' ); ?></option>
								<option value="admins"    <?php selected( $s['show_to'], 'admins' ); ?>><?php esc_html_e( 'Admins only', 'support-portal' ); ?></option>
							</select>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Button position', 'support-portal' ); ?></th>
						<td>
							<select name="button_position" id="sp_button_position">
								<option value="bottom-right" <?php selected( $s['button_position'], 'bottom-right' ); ?>><?php esc_html_e( 'Bottom right', 'support-portal' ); ?></option>
								<option value="bottom-left"  <?php selected( $s['button_position'], 'bottom-left' ); ?>><?php esc_html_e( 'Bottom left', 'support-portal' ); ?></option>
							</select>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="sp_button_text"><?php esc_html_e( 'Button text', 'support-portal' ); ?></label>
						</th>
						<td>
							<input type="text" id="sp_button_text" name="button_text" class="regular-text"
								value="<?php echo esc_attr( $s['button_text'] ); ?>" />
						</td>
					</tr>
				</table>
				<?php submit_button( esc_attr__( 'Save Settings', 'support-portal' ) ); ?>
			</form>
		</div>
		<?php
	}

	// ── Private helpers ─────────────────────────────────────────────────────────

	private function key_preview( $encoded ) {
		$raw = self::decrypt_key( $encoded );
		if ( '' === $raw ) {
			return '';
		}
		$len = strlen( $raw );
		return str_repeat( '•', max( 0, $len - 4 ) ) . substr( $raw, -4 );
	}
}
