=== Support Portal ===
Requires at least: 5.9
Tested up to: 6.6
Stable tag: 0.1.0
Requires PHP: 8.0
License: GPL-2.0+
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Adds a "Report an issue" button that captures the current page and lets
visitors annotate and submit to a support portal.

== Description ==

A floating "Report an issue" button is injected on the front end. When clicked:

1. html2canvas captures the current viewport as a JPEG screenshot.
2. A full-screen overlay opens with four annotation tools: rectangle, numbered
   pin, text note, and eraser (with undo).
3. The visitor fills in a title, description, name, and email.
4. The annotated screenshot and form data are POSTed to a local WP REST
   endpoint (/wp-json/support-portal/v1/submit), which proxies the request to
   the configured Support Portal API endpoint with the stored API key attached
   server-side. The API key is NEVER sent to the browser.

== Requirements ==

* WordPress 5.9+
* PHP 8.0+
* php.ini: post_max_size ≥ 8M, upload_max_filesize ≥ 8M
  (annotated JPEG screenshots can be up to ~5 MB after base64 encoding)
* html2canvas 1.4.1 vendor file (see Installation step 2)

== Installation ==

1. Upload the `support-portal` folder to /wp-content/plugins/.

2. Vendor html2canvas (required — the plugin will not enqueue assets without it):

   Option A — shell script (recommended):
       cd wp-content/plugins/support-portal
       bash bin/download-vendors.sh

   Option B — manual:
       Download html2canvas.min.js from:
           https://github.com/niklasvh/html2canvas/releases/tag/v1.4.1
       Place it at:
           wp-content/plugins/support-portal/assets/vendor/html2canvas.min.js

3. Activate the plugin in WordPress › Plugins.

4. Go to Settings › Support Portal and configure:
   - Portal API URL: your ingest endpoint, e.g.
         https://bd-support-portal.vercel.app/api/tickets/ingest
   - API Key: the raw key shown once when generated in your portal's admin
         (Settings › Support Portal shows only the last 4 characters after saving)
   - Show button to: All visitors / Logged-in users only / Admins only
   - Button position: Bottom right / Bottom left
   - Button text: defaults to "Report an issue"

5. Visit the front end. The floating button should appear per the visibility
   setting. Click it, annotate, fill the form, and submit. The ticket should
   appear in your portal's admin dashboard with the annotated screenshot,
   page URL, viewport, and user agent populated.

== Security ==

- The API key is stored base64-encoded in wp_options and is NEVER included in
  any page source or JavaScript payload. The JS only knows the WP REST URL and
  a per-session WordPress nonce.
- Every REST submission is verified with wp_verify_nonce('wp_rest'), providing
  CSRF protection for both logged-in and logged-out visitors.
- All PHP output is escaped with esc_html / esc_attr / esc_url.
- Settings save is gated by both a nonce and current_user_can('manage_options').

== File Structure ==

  support-portal/
    support-portal.php           Main plugin file (header, constants, requires)
    includes/
      class-settings.php         Admin settings page (Settings › Support Portal)
      class-ingest.php           WP REST route + front-end asset enqueueing
    assets/
      js/
        support-portal.js        Trigger button, html2canvas capture, overlay UI
        markup-canvas.js         Canvas annotation engine (rect, pin, text, erase)
      css/
        support-portal.css       All plugin styles (namespaced .sp- / #sp-)
      vendor/
        html2canvas.min.js       (must be downloaded — see Installation)
    bin/
      download-vendors.sh        Helper script to fetch html2canvas
    readme.txt                   This file

== Frequently Asked Questions ==

= The button doesn't appear =

Check these in order:
1. assets/vendor/html2canvas.min.js exists.
2. Settings › Support Portal has a non-empty API URL and API Key.
3. The "Show button to" setting matches the current user's role.
4. No JS console errors (open DevTools › Console while on a front-end page).

= I get a 403 on submit =

The WP REST nonce expired (default TTL is 24 h). Reload the page to get a
fresh nonce. If this recurs frequently, check that your caching plugin excludes
pages served to logged-out users from nonce caching.

= Screenshots are blank or partial =

html2canvas cannot capture cross-origin iframes or certain canvas-drawn content.
This is a known limitation. The report will still submit; the screenshot will
just be incomplete or show a grey area over the restricted element.

= The submit times out =

Increase wp_remote_post's timeout in includes/class-ingest.php (default: 30 s)
if your portal API is slow to respond. Also check that post_max_size in php.ini
is large enough (≥ 8M recommended).

== Changelog ==

= 0.1.0 =
* Initial release
