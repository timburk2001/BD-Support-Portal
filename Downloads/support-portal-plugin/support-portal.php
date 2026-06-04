<?php
/**
 * Plugin Name: Support Portal
 * Description: Adds a "Report an issue" button that captures the current page and lets visitors annotate and submit to the support portal.
 * Version:     0.5.0
 * Author:      <agency>
 * License:     GPL-2.0+
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SUPPORT_PORTAL_VERSION', '0.5.0' );
define( 'SUPPORT_PORTAL_PATH', plugin_dir_path( __FILE__ ) );
define( 'SUPPORT_PORTAL_URL', plugin_dir_url( __FILE__ ) );

require_once SUPPORT_PORTAL_PATH . 'includes/class-settings.php';
require_once SUPPORT_PORTAL_PATH . 'includes/class-ingest.php';

new Support_Portal_Settings();
new Support_Portal_Ingest();

// Admin notice when html2canvas vendor file is absent.
add_action( 'admin_notices', function () {
	if ( ! file_exists( SUPPORT_PORTAL_PATH . 'assets/vendor/html2canvas.min.js' ) ) {
		printf(
			'<div class="notice notice-warning"><p><strong>Support Portal:</strong> %s <code>support-portal/assets/vendor/html2canvas.min.js</code>. %s <a href="%s" target="_blank" rel="noopener noreferrer">%s</a> %s</p></div>',
			esc_html__( 'html2canvas is missing. Download it and place it at', 'support-portal' ),
			esc_html__( 'Get it from the', 'support-portal' ),
			'https://github.com/niklasvh/html2canvas/releases/tag/v1.4.1',
			esc_html__( 'html2canvas v1.4.1 release page', 'support-portal' ),
			esc_html__( '(html2canvas.min.js), or run bin/download-vendors.sh.', 'support-portal' )
		);
	}
} );
