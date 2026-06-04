(function () {
  'use strict';

  if (!window.SupportPortalConfig) return;

  var cfg             = window.SupportPortalConfig;
  var triggerBtn;
  var sessionBarEl;
  var capturedScreenshots = [];  // finalized annotated JPEGs from previous captures
  var savedFormData       = null; // { title, description, name, email } preserved between opens
  var submittingSession   = false; // true when overlay is open for final submit (no new capture)

  // ── Init ───────────────────────────────────────────────────────────────────

  function boot() {
    triggerBtn = document.createElement('button');
    triggerBtn.id        = 'sp-trigger';
    triggerBtn.className = 'sp-trigger sp-pos-' + (cfg.buttonPosition || 'bottom-right');
    triggerBtn.setAttribute('aria-label', cfg.buttonText || 'Report an issue');
    triggerBtn.textContent = cfg.buttonText || 'Report an issue';
    document.body.appendChild(triggerBtn);
    triggerBtn.addEventListener('click', startCapture);

    // Session bar — visible when screenshots are queued but overlay is closed
    sessionBarEl = document.createElement('div');
    sessionBarEl.id        = 'sp-session-bar';
    sessionBarEl.className = 'sp-session-bar sp-pos-' + (cfg.buttonPosition || 'bottom-right');
    sessionBarEl.style.display = 'none';
    sessionBarEl.innerHTML =
      '<span id="sp-session-count" class="sp-session-count"></span>' +
      '<button type="button" id="sp-session-submit" class="sp-session-submit-btn">Submit now</button>';
    document.body.appendChild(sessionBarEl);
    document.getElementById('sp-session-submit').addEventListener('click', startSubmitSession);
  }

  // ── Capture flows ──────────────────────────────────────────────────────────

  var displayStream = null;  // shared screen-capture stream for the session
  var captureVideo  = null;  // hidden <video> playing the stream

  function startCapture() {
    submittingSession      = false;
    triggerBtn.disabled    = true;
    triggerBtn.textContent = 'Capturing…';
    hideSessionBar();

    ensureDisplayStream()
      .then(captureFrame)
      .then(function (jpegDataUrl) {
        openOverlay(jpegDataUrl);
      })
      .catch(function (err) {
        console.error('[SupportPortal] capture error:', err);
        // A dead/denied stream shouldn't linger and block the next attempt.
        if (err && err.message === 'SECURE_CONTEXT') releaseDisplayStream();
        showToast(captureErrorMessage(err), 'error');
      })
      .then(function () {
        triggerBtn.disabled = false;
        updateTriggerState();
      });
  }

  // Open overlay showing saved screenshots + form only (no new capture)
  function startSubmitSession() {
    submittingSession = true;
    hideSessionBar();
    openOverlay(null);
  }

  // ── Screen capture (getDisplayMedia) ────────────────────────────────────────
  // Captures exactly what's painted in the tab — pixel-perfect and immune to
  // the DOM re-render problems of html2canvas. The stream is requested once per
  // session (a single "share this tab" prompt) and reused for every capture,
  // so the multi-issue flow never re-prompts.

  function ensureDisplayStream() {
    if (displayStream && displayStream.active) {
      return Promise.resolve();
    }
    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getDisplayMedia ||
        !window.isSecureContext) {
      return Promise.reject(new Error('SECURE_CONTEXT'));
    }
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 8 } },
      audio: false,
      preferCurrentTab: true, // Chrome: default the picker to this tab
    }).then(function (stream) {
      displayStream = stream;
      // If the user hits the browser's native "Stop sharing", drop our ref so
      // the next capture re-prompts instead of grabbing from a dead stream.
      stream.getVideoTracks().forEach(function (t) {
        t.addEventListener('ended', releaseDisplayStream);
      });
      captureVideo = document.createElement('video');
      captureVideo.muted       = true;
      captureVideo.playsInline = true;
      // Rendered (so it keeps decoding frames) but off-screen, so it never
      // appears in the captured tab.
      captureVideo.style.cssText =
        'position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
      captureVideo.srcObject = stream;
      document.body.appendChild(captureVideo);
      return captureVideo.play().then(function () {
        return waitForVideoReady(captureVideo);
      });
    });
  }

  function waitForVideoReady(video) {
    return new Promise(function (resolve) {
      if (video.videoWidth > 0 && video.readyState >= 2) { resolve(); return; }
      var done = false;
      function ready() { if (done) return; done = true; resolve(); }
      video.addEventListener('loadeddata', ready, { once: true });
      setTimeout(ready, 1500); // safety net so we never hang
    });
  }

  // Grab a single still from the live stream, hiding our own UI first so the
  // floating button / session bar never appear in the shot.
  function captureFrame() {
    return hideOwnUiThen(function () {
      var w = captureVideo ? captureVideo.videoWidth  : 0;
      var h = captureVideo ? captureVideo.videoHeight : 0;
      if (!w || !h) throw new Error('NO_FRAME');
      var canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(captureVideo, 0, 0, w, h);
      // JPEG at 0.85 keeps payload well under the portal's 4 MB limit
      return canvas.toDataURL('image/jpeg', 0.85);
    });
  }

  // Hide trigger + session bar, wait for the stream to reflect the change,
  // run fn, then restore. Returns fn()'s result.
  function hideOwnUiThen(fn) {
    var prevTrigger = triggerBtn   ? triggerBtn.style.visibility   : '';
    var prevBar     = sessionBarEl ? sessionBarEl.style.visibility : '';
    if (triggerBtn)   triggerBtn.style.visibility   = 'hidden';
    if (sessionBarEl) sessionBarEl.style.visibility = 'hidden';
    return nextPaint().then(nextPaint).then(function () {
      try {
        return fn();
      } finally {
        if (triggerBtn)   triggerBtn.style.visibility   = prevTrigger;
        if (sessionBarEl) sessionBarEl.style.visibility = prevBar;
      }
    });
  }

  function nextPaint() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { setTimeout(resolve, 40); });
    });
  }

  function releaseDisplayStream() {
    if (displayStream) {
      displayStream.getTracks().forEach(function (t) { t.stop(); });
      displayStream = null;
    }
    if (captureVideo) {
      captureVideo.srcObject = null;
      captureVideo.remove();
      captureVideo = null;
    }
  }

  function captureErrorMessage(err) {
    if (err && err.message === 'SECURE_CONTEXT') {
      return 'Screen capture needs a secure (https://) connection. Please open this page over https and try again.';
    }
    if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      return 'Screen capture was cancelled.';
    }
    return 'Could not capture the screen. Please try again.';
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  function openOverlay(jpegDataUrl) {
    var overlay = document.createElement('div');
    overlay.id        = 'sp-overlay';
    overlay.innerHTML = overlayHTML();
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    if (!submittingSession && jpegDataUrl) {
      initCanvas(jpegDataUrl);
      wireTools();
    } else {
      // Submit mode — swap canvas area for a thumbnail summary
      var canvasArea = document.getElementById('sp-canvas-area');
      if (canvasArea) canvasArea.innerHTML = buildSubmitSummary();
      var toolsBar = overlay.querySelector('.sp-tools-bar');
      if (toolsBar) toolsBar.style.display = 'none';
      var titleEl = overlay.querySelector('.sp-sidebar-title');
      if (titleEl) titleEl.textContent = 'Submit your report';
    }

    prefillUser();
    restoreFormData();
    wireSubmit();
    wireAddIssue();
    wireClose();

    overlay.setAttribute('tabindex', '-1');
    overlay.focus();
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeOverlay();
    });

    refreshScreenshotInfo();
  }

  function buildSubmitSummary() {
    var n = capturedScreenshots.length;
    var thumbs = capturedScreenshots.map(function (dataUrl, i) {
      return '<img src="' + dataUrl + '" class="sp-submit-thumb" alt="Screenshot ' + (i + 1) + '">';
    }).join('');
    return (
      '<div class="sp-submit-summary">' +
        '<p class="sp-submit-summary-count">' + n + ' screenshot' + (n !== 1 ? 's' : '') + ' ready to submit</p>' +
        '<div class="sp-submit-thumbs">' + thumbs + '</div>' +
      '</div>'
    );
  }

  function overlayHTML() {
    return [
      '<div class="sp-inner">',
      '  <div id="sp-canvas-area" class="sp-canvas-area">',
      '    <canvas id="sp-markup-canvas"></canvas>',
      '  </div>',
      '  <aside class="sp-sidebar" role="complementary">',

      '    <div class="sp-sidebar-head">',
      '      <h2 class="sp-sidebar-title">Report an issue</h2>',
      '      <button type="button" id="sp-close" class="sp-close" aria-label="Close">&times;</button>',
      '    </div>',

      '    <div id="sp-screenshot-info" class="sp-screenshot-info" style="display:none">',
      '      <span id="sp-screenshot-counter" class="sp-screenshot-counter"></span>',
      '      <div id="sp-thumbnail-strip" class="sp-thumbnail-strip"></div>',
      '    </div>',

      '    <div class="sp-tools-bar">',
      '      <span class="sp-tools-label">Annotate</span>',
      '      <div class="sp-tool-group" role="toolbar" aria-label="Annotation tools">',
      '        <button type="button" data-tool="rect"   class="sp-tool sp-tool-active" title="Draw rectangle">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="12" height="12" rx="1.5"/></svg>Rect',
      '        </button>',
      '        <button type="button" data-tool="pin"    class="sp-tool" title="Drop numbered pin">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7.5" cy="6" r="3"/><line x1="7.5" y1="9" x2="7.5" y2="14"/></svg>Pin',
      '        </button>',
      '        <button type="button" data-tool="text"   class="sp-tool" title="Add text note">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3h9M7.5 3v9"/></svg>Text',
      '        </button>',
      '        <button type="button" data-tool="eraser" class="sp-tool" title="Erase annotation">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 4 13"/><path d="M2 13h11"/></svg>Erase',
      '        </button>',
      '        <button type="button" id="sp-undo" class="sp-tool" title="Undo">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 6h7a4 4 0 0 1 0 8H6"/><path d="M2 6l3-3-3 3 3 3"/></svg>Undo',
      '        </button>',
      '      </div>',
      '    </div>',

      '    <form id="sp-form" class="sp-form" novalidate>',
      '      <div class="sp-field">',
      '        <label for="sp-title">Title <span class="sp-req" aria-hidden="true">*</span></label>',
      '        <input type="text" id="sp-title" name="title" maxlength="120" placeholder="Brief summary" autocomplete="off" required />',
      '      </div>',
      '      <div class="sp-field">',
      '        <label for="sp-description">Description <span class="sp-req" aria-hidden="true">*</span></label>',
      '        <textarea id="sp-description" name="description" rows="4" placeholder="Steps to reproduce, what you expected, what happened…" required></textarea>',
      '      </div>',
      '      <div class="sp-field">',
      '        <label for="sp-name">Name <span class="sp-req" aria-hidden="true">*</span></label>',
      '        <input type="text" id="sp-name" name="submitter_name" placeholder="Your name" autocomplete="name" required />',
      '      </div>',
      '      <div class="sp-field">',
      '        <label for="sp-email">Email <span class="sp-req" aria-hidden="true">*</span></label>',
      '        <input type="email" id="sp-email" name="submitter_email" placeholder="you@example.com" autocomplete="email" required />',
      '      </div>',
      '      <div id="sp-error" class="sp-error" role="alert" style="display:none"></div>',
      '      <button type="submit" id="sp-submit" class="sp-submit">Submit report</button>',
      '      <button type="button" id="sp-add-issue" class="sp-add-issue-btn">+ Report another issue</button>',
      '    </form>',
      '  </aside>',
      '</div>',
    ].join('\n');
  }

  // ── Canvas init ────────────────────────────────────────────────────────────

  function initCanvas(jpegDataUrl) {
    var canvasArea = document.getElementById('sp-canvas-area');
    var areaW = canvasArea ? canvasArea.clientWidth : window.innerWidth - 360;
    MarkupCanvas.init(document.getElementById('sp-markup-canvas'), jpegDataUrl, areaW);
  }

  // ── Save & report another issue ────────────────────────────────────────────

  // Called from the "+ Report another issue" button in annotation mode.
  // Finalises the current screenshot, closes the overlay, and lets the user
  // navigate to the next problem area before triggering a new capture.
  function saveAndReportAnother() {
    savedFormData = collectFormData();
    capturedScreenshots.push(MarkupCanvas.getDataUrl());
    MarkupCanvas.destroy();
    softCloseOverlay();
    showToast('Screenshot saved — navigate to your next issue.', 'success');
  }

  // Called when the user is in submit mode and wants to add more instead.
  // Nothing to save from the canvas (there isn't one); just return to session.
  function returnToSession() {
    savedFormData = collectFormData();
    softCloseOverlay();
  }

  // Close overlay without discarding the session.
  function softCloseOverlay() {
    var overlay = document.getElementById('sp-overlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
    submittingSession = false;
    updateTriggerState();
    showSessionBar();
  }

  // ── Form data helpers ──────────────────────────────────────────────────────

  function collectFormData() {
    return {
      title:       (document.getElementById('sp-title')       || {}).value || '',
      description: (document.getElementById('sp-description') || {}).value || '',
      name:        (document.getElementById('sp-name')        || {}).value || '',
      email:       (document.getElementById('sp-email')       || {}).value || '',
    };
  }

  function restoreFormData() {
    if (!savedFormData) return;
    var titleEl = document.getElementById('sp-title');
    var descEl  = document.getElementById('sp-description');
    var nameEl  = document.getElementById('sp-name');
    var emailEl = document.getElementById('sp-email');
    if (titleEl && savedFormData.title)       titleEl.value = savedFormData.title;
    if (descEl  && savedFormData.description) descEl.value  = savedFormData.description;
    if (nameEl  && savedFormData.name)        nameEl.value  = savedFormData.name;
    if (emailEl && savedFormData.email)       emailEl.value = savedFormData.email;
  }

  // ── Screenshot counter + thumbnails ───────────────────────────────────────

  function refreshScreenshotInfo() {
    var info    = document.getElementById('sp-screenshot-info');
    var counter = document.getElementById('sp-screenshot-counter');
    var strip   = document.getElementById('sp-thumbnail-strip');
    if (!info || !counter || !strip) return;

    var savedCount = capturedScreenshots.length;
    if (savedCount === 0) {
      info.style.display = 'none';
      return;
    }

    var total = submittingSession ? savedCount : savedCount + 1;
    info.style.display = 'block';
    counter.textContent = total + ' screenshot' + (total !== 1 ? 's' : '');

    strip.innerHTML = '';
    capturedScreenshots.forEach(function (dataUrl, i) {
      var wrap      = document.createElement('div');
      wrap.className = 'sp-thumb-wrap';
      wrap.title     = 'Screenshot ' + (i + 1) + ' (saved)';

      var img       = document.createElement('img');
      img.src       = dataUrl;
      img.className = 'sp-thumbnail';
      img.alt       = 'Screenshot ' + (i + 1);

      var label       = document.createElement('span');
      label.className = 'sp-thumb-label';
      label.textContent = i + 1;

      wrap.appendChild(img);
      wrap.appendChild(label);
      strip.appendChild(wrap);
    });

    if (!submittingSession) {
      var curWrap       = document.createElement('div');
      curWrap.className = 'sp-thumb-wrap sp-thumb-current';
      curWrap.title     = 'Screenshot ' + total + ' (current)';
      var curLabel      = document.createElement('span');
      curLabel.className = 'sp-thumb-label';
      curLabel.textContent = total + ' ✏';
      curWrap.appendChild(curLabel);
      strip.appendChild(curWrap);
    }
  }

  // ── Session bar ────────────────────────────────────────────────────────────

  function showSessionBar() {
    var n       = capturedScreenshots.length;
    var countEl = document.getElementById('sp-session-count');
    if (countEl) {
      countEl.textContent = n + ' issue' + (n !== 1 ? 's' : '') + ' captured';
    }
    sessionBarEl.style.display = 'flex';
  }

  function hideSessionBar() {
    if (sessionBarEl) sessionBarEl.style.display = 'none';
  }

  function updateTriggerState() {
    if (capturedScreenshots.length > 0) {
      triggerBtn.textContent = '+ Capture another issue';
      triggerBtn.setAttribute('aria-label', 'Capture another issue');
    } else {
      triggerBtn.textContent = cfg.buttonText || 'Report an issue';
      triggerBtn.setAttribute('aria-label', cfg.buttonText || 'Report an issue');
    }
  }

  // ── User pre-fill ──────────────────────────────────────────────────────────

  function prefillUser() {
    if (!cfg.currentUser) return;
    var name  = document.getElementById('sp-name');
    var email = document.getElementById('sp-email');
    if (name && cfg.currentUser.name) {
      name.value    = cfg.currentUser.name;
      name.readOnly = true;
    }
    if (email && cfg.currentUser.email) {
      email.value    = cfg.currentUser.email;
      email.readOnly = true;
    }
  }

  // ── Tool buttons ───────────────────────────────────────────────────────────

  function wireTools() {
    var toolBtns = document.querySelectorAll('.sp-tool[data-tool]');
    toolBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        toolBtns.forEach(function (b) { b.classList.remove('sp-tool-active'); });
        btn.classList.add('sp-tool-active');
        MarkupCanvas.setTool(btn.getAttribute('data-tool'));
      });
    });

    var undoBtn = document.getElementById('sp-undo');
    if (undoBtn) undoBtn.addEventListener('click', function () { MarkupCanvas.undo(); });
  }

  // ── "Report another issue" button ─────────────────────────────────────────

  function wireAddIssue() {
    var btn = document.getElementById('sp-add-issue');
    if (!btn) return;
    // In submit mode there is no canvas to finalise — just return to session.
    btn.addEventListener('click', submittingSession ? returnToSession : saveAndReportAnother);
  }

  // ── Form submit ────────────────────────────────────────────────────────────

  function wireSubmit() {
    var form = document.getElementById('sp-form');
    form.addEventListener('submit', function (e) { e.preventDefault(); doSubmit(); });
  }

  function doSubmit() {
    var titleEl = document.getElementById('sp-title');
    var descEl  = document.getElementById('sp-description');
    var nameEl  = document.getElementById('sp-name');
    var emailEl = document.getElementById('sp-email');

    var title       = titleEl  ? titleEl.value.trim()  : '';
    var description = descEl   ? descEl.value.trim()   : '';
    var name        = nameEl   ? nameEl.value.trim()   : '';
    var email       = emailEl  ? emailEl.value.trim()  : '';

    hideError();

    if (!title || !description || !name || !email) {
      showError('Please fill in all required fields.');
      return;
    }
    if (!validEmail(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    var submitBtn = document.getElementById('sp-submit');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';

    // In submit mode all screenshots are already in capturedScreenshots.
    // In annotation mode we append the current canvas as the final screenshot.
    var allScreenshots = submittingSession
      ? capturedScreenshots.slice()
      : capturedScreenshots.concat([MarkupCanvas.getDataUrl()]);

    var payload = {
      title:                title,
      description:          description,
      submitter_name:       name,
      submitter_email:      email,
      page_url:             window.location.href,
      browser:              navigator.userAgent,
      device:               navigator.userAgent,
      viewport:             window.innerWidth + 'x' + window.innerHeight,
      annotated_screenshots: allScreenshots,
    };

    fetch(cfg.restUrl, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce':   cfg.nonce,
      },
      body: JSON.stringify(payload),
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.message || data.error || 'Submission failed (' + res.status + ')');
        });
      }
      return res.json();
    })
    .then(function () {
      closeOverlay();
      showToast('Submitted — thanks!', 'success');
    })
    .catch(function (err) {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit report';
      showError(err.message || 'Submission failed. Please try again.');
    });
  }

  // ── Close (hard — discards entire session) ────────────────────────────────

  function wireClose() {
    var closeBtn = document.getElementById('sp-close');
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
  }

  function closeOverlay() {
    var overlay = document.getElementById('sp-overlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
    if (!submittingSession) MarkupCanvas.destroy();
    capturedScreenshots = [];
    savedFormData       = null;
    submittingSession   = false;
    // End of session — stop sharing so the browser's capture indicator clears.
    releaseDisplayStream();
    hideSessionBar();
    updateTriggerState();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function showError(msg) {
    var el = document.getElementById('sp-error');
    if (el) {
      el.textContent   = msg;
      el.style.display = 'block';
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  function hideError() {
    var el = document.getElementById('sp-error');
    if (el) el.style.display = 'none';
  }

  function showToast(msg, type) {
    var toast       = document.createElement('div');
    toast.className = 'sp-toast sp-toast-' + type;
    toast.setAttribute('role', 'status');
    toast.textContent = msg;
    document.body.appendChild(toast);
    toast.offsetHeight; // force reflow for transition
    toast.classList.add('sp-toast-show');
    setTimeout(function () {
      toast.classList.remove('sp-toast-show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3500);
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
