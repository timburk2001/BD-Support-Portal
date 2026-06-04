(function () {
  'use strict';

  if (!window.SupportPortalConfig) return;

  var cfg             = window.SupportPortalConfig;
  var triggerBtn;
  var sessionBarEl;
  // Each entry: { image: rawScreenshotDataUrl, annotations: [...], _thumb?: dataUrl }
  var capturedScreenshots = [];
  var savedFormData       = null; // { title, description, name, email, replyTo }
  var submittingSession   = false; // overlay open for final submit (no live canvas)
  var editingIndex        = null;  // index of the saved screenshot being edited, else null
  var currentRawImage     = null;  // raw capture currently on the canvas

  // sessionStorage key — persists the in-progress report across full page
  // navigations within the same tab (cleared on submit, close, or tab close).
  var SP_STORE_KEY = 'sp_session_v1';

  // ── Init ───────────────────────────────────────────────────────────────────

  function boot() {
    triggerBtn = document.createElement('button');
    triggerBtn.id        = 'sp-trigger';
    triggerBtn.className = 'sp-trigger sp-pos-' + (cfg.buttonPosition || 'bottom-right');
    triggerBtn.setAttribute('aria-label', cfg.buttonText || 'Report an issue');
    triggerBtn.textContent = cfg.buttonText || 'Report an issue';
    document.body.appendChild(triggerBtn);
    triggerBtn.addEventListener('click', startCapture);

    sessionBarEl = document.createElement('div');
    sessionBarEl.id        = 'sp-session-bar';
    sessionBarEl.className = 'sp-session-bar sp-pos-' + (cfg.buttonPosition || 'bottom-right');
    sessionBarEl.style.display = 'none';
    sessionBarEl.innerHTML =
      '<span id="sp-session-count" class="sp-session-count"></span>' +
      '<button type="button" id="sp-session-submit" class="sp-session-submit-btn">Submit now</button>';
    document.body.appendChild(sessionBarEl);
    document.getElementById('sp-session-submit').addEventListener('click', startSubmitSession);

    // Restore any in-progress report from a previous page in this tab.
    loadSession();
    if (capturedScreenshots.length > 0) {
      updateTriggerState();
      showSessionBar();
    }
  }

  // ── Session persistence (survives page navigation within the tab) ───────────

  function persistSession() {
    try {
      sessionStorage.setItem(SP_STORE_KEY, JSON.stringify(
        { screenshots: capturedScreenshots, form: savedFormData },
        function (k, v) { return k === '_thumb' ? undefined : v; } // don't persist thumb cache
      ));
    } catch (e) {
      console.warn('[SupportPortal] could not persist session:', e);
      showToast('Too many screenshots to carry across pages — submit soon.', 'error');
    }
  }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SP_STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.screenshots)) {
        capturedScreenshots = data.screenshots.map(function (s) {
          // Back-compat: old sessions stored flattened JPEG strings.
          return (typeof s === 'string') ? { image: s, annotations: [] } : s;
        });
      }
      if (data && data.form) savedFormData = data.form;
    } catch (e) {
      console.warn('[SupportPortal] could not load session:', e);
    }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SP_STORE_KEY); } catch (e) {}
  }

  // ── Capture flows ──────────────────────────────────────────────────────────

  var displayStream = null;  // shared screen-capture stream for the session
  var captureVideo  = null;  // hidden <video> playing the stream

  function startCapture() {
    submittingSession      = false;
    editingIndex           = null;
    triggerBtn.disabled    = true;
    triggerBtn.textContent = 'Capturing…';
    hideSessionBar();

    ensureDisplayStream()
      .then(captureFrame)
      .then(function (rawImage) {
        openOverlay(rawImage);
      })
      .catch(function (err) {
        console.error('[SupportPortal] capture error:', err);
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
    editingIndex      = null;
    hideSessionBar();
    openOverlay(null);
  }

  // ── Screen capture (getDisplayMedia) ────────────────────────────────────────

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
      preferCurrentTab: true,
    }).then(function (stream) {
      displayStream = stream;
      stream.getVideoTracks().forEach(function (t) {
        t.addEventListener('ended', releaseDisplayStream);
      });
      captureVideo = document.createElement('video');
      captureVideo.muted       = true;
      captureVideo.playsInline = true;
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
      setTimeout(ready, 1500);
    });
  }

  // Grab a still from the live stream (downscaled to 1600px wide), hiding our
  // own UI first so the floating button / session bar never appear in the shot.
  function captureFrame() {
    return hideOwnUiThen(function () {
      var w = captureVideo ? captureVideo.videoWidth  : 0;
      var h = captureVideo ? captureVideo.videoHeight : 0;
      if (!w || !h) throw new Error('NO_FRAME');
      var scale = Math.min(1, 1600 / w);
      var cw = Math.round(w * scale);
      var ch = Math.round(h * scale);
      var c  = document.createElement('canvas');
      c.width  = cw;
      c.height = ch;
      c.getContext('2d').drawImage(captureVideo, 0, 0, cw, ch);
      return c.toDataURL('image/jpeg', 0.85);
    });
  }

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

  function openOverlay(imageDataUrl) {
    removeOverlayDom(); // idempotent — never stack overlays

    var overlay = document.createElement('div');
    overlay.id        = 'sp-overlay';
    overlay.innerHTML = overlayHTML();
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    if (!submittingSession && imageDataUrl) {
      currentRawImage = imageDataUrl;
      var initialAnns = (editingIndex != null && capturedScreenshots[editingIndex])
        ? capturedScreenshots[editingIndex].annotations
        : [];
      initCanvas(imageDataUrl, initialAnns);
      wireTools();
      setActiveTool('pin');
    } else {
      // Submit/review mode — swap canvas area for the screenshot manager.
      var canvasArea = document.getElementById('sp-canvas-area');
      if (canvasArea) { canvasArea.innerHTML = ''; canvasArea.appendChild(buildSubmitSummary()); }
      var toolsBar = overlay.querySelector('.sp-tools-bar');
      if (toolsBar) toolsBar.style.display = 'none';
      var titleEl = overlay.querySelector('.sp-sidebar-title');
      if (titleEl) titleEl.textContent = 'Review & submit';
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

  function overlayHTML() {
    return [
      '<div class="sp-inner">',
      '  <div id="sp-canvas-area" class="sp-canvas-area">',
      '    <div class="sp-canvas-wrap">',
      '      <canvas id="sp-markup-canvas"></canvas>',
      '      <div id="sp-badge-layer" class="sp-badge-layer"></div>',
      '    </div>',
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
      '        <button type="button" data-tool="pin" class="sp-tool sp-tool-active" title="Pinned comment">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7.5" cy="6" r="3"/><line x1="7.5" y1="9" x2="7.5" y2="14"/></svg>Comment',
      '        </button>',
      '        <button type="button" data-tool="rect" class="sp-tool" title="Draw rectangle">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="12" height="12" rx="1.5"/></svg>Rectangle',
      '        </button>',
      '        <button type="button" data-tool="circle" class="sp-tool" title="Draw circle">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7.5" cy="7.5" r="6"/></svg>Circle',
      '        </button>',
      '        <button type="button" data-tool="arrow" class="sp-tool" title="Draw arrow">',
      '          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><line x1="2" y1="13" x2="13" y2="2"/><path d="M7 2h6v6"/></svg>Arrow',
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
      '      <div class="sp-field">',
      '        <label for="sp-reply-to">Reply-to email <span class="sp-optional">(optional)</span></label>',
      '        <input type="email" id="sp-reply-to" name="reply_to_email" placeholder="Where should we reply, if different?" autocomplete="email" />',
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

  function initCanvas(imageDataUrl, annotations) {
    MarkupCanvas.init(document.getElementById('sp-markup-canvas'), imageDataUrl, annotations);
  }

  function setActiveTool(tool) {
    var btns = document.querySelectorAll('.sp-tool[data-tool]');
    btns.forEach(function (b) {
      b.classList.toggle('sp-tool-active', b.getAttribute('data-tool') === tool);
    });
    MarkupCanvas.setTool(tool);
  }

  // ── Save & report another issue ────────────────────────────────────────────

  function saveAndReportAnother() {
    savedFormData = collectFormData();
    var entry = { image: currentRawImage, annotations: MarkupCanvas.getState().annotations };
    if (editingIndex != null && capturedScreenshots[editingIndex]) {
      capturedScreenshots[editingIndex] = entry;
    } else {
      capturedScreenshots.push(entry);
    }
    editingIndex = null;
    MarkupCanvas.destroy();
    persistSession();
    softCloseOverlay();
    showToast('Screenshot saved — go to your next issue (other pages are fine).', 'success');
  }

  // Submit mode "+ Report another issue" — nothing live to save, just resume.
  function returnToSession() {
    savedFormData = collectFormData();
    persistSession();
    softCloseOverlay();
  }

  // Close overlay without discarding the session.
  function softCloseOverlay() {
    removeOverlayDom();
    submittingSession = false;
    editingIndex      = null;
    updateTriggerState();
    showSessionBar();
  }

  // ── Screenshot management (edit / delete saved screenshots) ────────────────

  function editScreenshot(i) {
    var entry = capturedScreenshots[i];
    if (!entry) return;
    // Tear down the current overlay DOM without clearing the session.
    MarkupCanvas.destroy();
    removeOverlayDom();
    submittingSession = false;
    editingIndex      = i;
    openOverlay(entry.image);
  }

  function deleteScreenshot(i) {
    if (i < 0 || i >= capturedScreenshots.length) return;
    capturedScreenshots.splice(i, 1);
    persistSession();
    if (submittingSession) {
      if (capturedScreenshots.length === 0) { closeOverlay(); return; }
      var area = document.getElementById('sp-canvas-area');
      if (area) { area.innerHTML = ''; area.appendChild(buildSubmitSummary()); }
    }
    refreshScreenshotInfo();
  }

  // ── Thumbnails ─────────────────────────────────────────────────────────────

  // Lazily flatten an entry to a small JPEG and assign it to imgEl, caching on
  // the entry so we don't re-render every time.
  function fillThumb(imgEl, entry, maxWidth) {
    if (entry._thumb) { imgEl.src = entry._thumb; return; }
    MarkupCanvas.flatten(entry.image, entry.annotations, { maxWidth: maxWidth || 240, quality: 0.7 })
      .then(function (url) { entry._thumb = url; imgEl.src = url; })
      .catch(function () { /* leave placeholder */ });
  }

  // Build a managed thumbnail (with Edit + Delete) for the review screen.
  function buildManagedThumb(entry, i) {
    var wrap = document.createElement('div');
    wrap.className = 'sp-thumb-wrap sp-thumb-wrap-lg';
    wrap.title     = 'Screenshot ' + (i + 1);

    var img = document.createElement('img');
    img.className = 'sp-submit-thumb';
    img.alt = 'Screenshot ' + (i + 1);
    fillThumb(img, entry, 360);
    wrap.appendChild(img);

    var label = document.createElement('span');
    label.className = 'sp-thumb-label';
    label.textContent = i + 1;
    wrap.appendChild(label);

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'sp-thumb-edit';
    edit.title = 'Edit annotations';
    edit.textContent = '✏';
    edit.addEventListener('click', function () { editScreenshot(i); });
    wrap.appendChild(edit);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'sp-thumb-delete';
    del.title = 'Delete screenshot';
    del.textContent = '✕';
    del.addEventListener('click', function () { deleteScreenshot(i); });
    wrap.appendChild(del);

    return wrap;
  }

  function buildSubmitSummary() {
    var n = capturedScreenshots.length;
    var box = document.createElement('div');
    box.className = 'sp-submit-summary';

    var p = document.createElement('p');
    p.className = 'sp-submit-summary-count';
    p.textContent = n + ' screenshot' + (n !== 1 ? 's' : '') + ' ready — edit or remove any below';
    box.appendChild(p);

    var thumbs = document.createElement('div');
    thumbs.className = 'sp-submit-thumbs';
    capturedScreenshots.forEach(function (entry, i) {
      thumbs.appendChild(buildManagedThumb(entry, i));
    });
    box.appendChild(thumbs);
    return box;
  }

  // Sidebar counter + thumbnail strip (annotation mode).
  function refreshScreenshotInfo() {
    var info    = document.getElementById('sp-screenshot-info');
    var counter = document.getElementById('sp-screenshot-counter');
    var strip   = document.getElementById('sp-thumbnail-strip');
    if (!info || !counter || !strip) return;

    var savedCount   = capturedScreenshots.length;
    var isNewCapture = (!submittingSession && editingIndex == null);

    if (savedCount === 0 && !isNewCapture) {
      info.style.display = 'none';
      return;
    }
    // Nothing to show in a brand-new single capture until something is saved.
    if (savedCount === 0 && isNewCapture) {
      info.style.display = 'none';
      return;
    }

    var total = isNewCapture ? savedCount + 1 : savedCount;
    info.style.display = 'block';
    counter.textContent = total + ' screenshot' + (total !== 1 ? 's' : '');

    strip.innerHTML = '';
    capturedScreenshots.forEach(function (entry, i) {
      var wrap = document.createElement('div');
      wrap.className = 'sp-thumb-wrap';
      if (i === editingIndex) wrap.className += ' sp-thumb-editing';
      wrap.title = 'Screenshot ' + (i + 1);

      var img = document.createElement('img');
      img.className = 'sp-thumbnail';
      img.alt = 'Screenshot ' + (i + 1);
      fillThumb(img, entry, 160);
      wrap.appendChild(img);

      var label = document.createElement('span');
      label.className = 'sp-thumb-label';
      label.textContent = i + 1;
      wrap.appendChild(label);

      strip.appendChild(wrap);
    });

    if (isNewCapture) {
      var curWrap = document.createElement('div');
      curWrap.className = 'sp-thumb-wrap sp-thumb-current';
      curWrap.title = 'Screenshot ' + total + ' (current)';
      var curLabel = document.createElement('span');
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
        setActiveTool(btn.getAttribute('data-tool'));
      });
    });
  }

  // ── "Report another issue" button ─────────────────────────────────────────

  function wireAddIssue() {
    var btn = document.getElementById('sp-add-issue');
    if (!btn) return;
    btn.addEventListener('click', submittingSession ? returnToSession : saveAndReportAnother);
  }

  // ── Form data helpers ──────────────────────────────────────────────────────

  function collectFormData() {
    return {
      title:       (document.getElementById('sp-title')       || {}).value || '',
      description: (document.getElementById('sp-description') || {}).value || '',
      name:        (document.getElementById('sp-name')        || {}).value || '',
      email:       (document.getElementById('sp-email')       || {}).value || '',
      replyTo:     (document.getElementById('sp-reply-to')    || {}).value || '',
    };
  }

  function restoreFormData() {
    if (!savedFormData) return;
    var map = {
      'sp-title':       savedFormData.title,
      'sp-description': savedFormData.description,
      'sp-name':        savedFormData.name,
      'sp-email':       savedFormData.email,
      'sp-reply-to':    savedFormData.replyTo,
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && map[id]) el.value = map[id];
    });
  }

  // ── Form submit ────────────────────────────────────────────────────────────

  function wireSubmit() {
    var form = document.getElementById('sp-form');
    form.addEventListener('submit', function (e) { e.preventDefault(); doSubmit(); });
  }

  function doSubmit() {
    var title       = (document.getElementById('sp-title')       || {}).value || '';
    var description = (document.getElementById('sp-description') || {}).value || '';
    var name        = (document.getElementById('sp-name')        || {}).value || '';
    var email       = (document.getElementById('sp-email')       || {}).value || '';
    var replyTo     = (document.getElementById('sp-reply-to')    || {}).value || '';
    title = title.trim(); description = description.trim();
    name = name.trim(); email = email.trim(); replyTo = replyTo.trim();

    hideError();

    if (!title || !description || !name || !email) {
      showError('Please fill in all required fields.');
      return;
    }
    if (!validEmail(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    if (replyTo && !validEmail(replyTo)) {
      showError('The reply-to email is not valid.');
      return;
    }

    // Build the list of entries to flatten WITHOUT mutating the persistent
    // array (so a failed submit can be retried without duplicating).
    var entries = capturedScreenshots.slice();
    if (!submittingSession) {
      var liveEntry = { image: currentRawImage, annotations: MarkupCanvas.getState().annotations };
      if (editingIndex != null && capturedScreenshots[editingIndex]) entries[editingIndex] = liveEntry;
      else entries.push(liveEntry);
    }

    if (entries.length === 0) {
      showError('Please capture at least one screenshot.');
      return;
    }

    var submitBtn = document.getElementById('sp-submit');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';

    var finalDescription = description + compilePinComments(entries);

    Promise.all(entries.map(function (en) {
      return MarkupCanvas.flatten(en.image, en.annotations, { maxWidth: 1600, quality: 0.85 });
    })).then(function (jpegs) {
      var payload = {
        title:                 title,
        description:           finalDescription,
        submitter_name:        name,
        submitter_email:       email,
        reply_to_email:        replyTo,
        page_url:              window.location.href,
        browser:               navigator.userAgent,
        device:                navigator.userAgent,
        viewport:              window.innerWidth + 'x' + window.innerHeight,
        annotated_screenshots: jpegs,
      };

      return fetch(cfg.restUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
        body: JSON.stringify(payload),
      });
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(data.message || data.error || 'Submission failed (' + res.status + ')');
        });
      }
      return res.json();
    }).then(function (data) {
      endSession();
      showSuccessPanel(data && data.signup_url);
    }).catch(function (err) {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit report';
      showError(err.message || 'Submission failed. Please try again.');
    });
  }

  // Compile pin comments across all screenshots into a numbered text block.
  function compilePinComments(entries) {
    var lines = [];
    entries.forEach(function (en, si) {
      var pins = (en.annotations || []).filter(function (a) { return a.type === 'pin' && a.comment; });
      if (!pins.length) return;
      pins.sort(function (a, b) { return a.num - b.num; });
      lines.push('Screenshot ' + (si + 1) + ':');
      pins.forEach(function (p) { lines.push('  ' + p.num + '. ' + p.comment); });
    });
    return lines.length ? '\n\n--- Pinned comments ---\n' + lines.join('\n') : '';
  }

  // ── Success panel ───────────────────────────────────────────────────────────

  function showSuccessPanel(signupUrl) {
    var overlay = document.getElementById('sp-overlay');
    if (!overlay) { showToast('Submitted — thanks!', 'success'); return; }
    var cta = signupUrl
      ? '<a class="sp-success-cta" href="' + signupUrl + '" target="_blank" rel="noopener">Create an account →</a>'
      : '';
    overlay.innerHTML =
      '<div class="sp-success">' +
      '  <div class="sp-success-icon">✓</div>' +
      '  <h2 class="sp-success-title">Report submitted — thank you!</h2>' +
      '  <p class="sp-success-body">Create a free account to track this ticket’s progress and reply to our team.</p>' +
      cta +
      '  <button type="button" id="sp-success-done" class="sp-success-dismiss">Close</button>' +
      '</div>';
    var done = document.getElementById('sp-success-done');
    if (done) done.addEventListener('click', removeOverlayDom);
  }

  // ── Close ────────────────────────────────────────────────────────────────────

  function wireClose() {
    var closeBtn = document.getElementById('sp-close');
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
  }

  function removeOverlayDom() {
    var overlay = document.getElementById('sp-overlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
  }

  // Hard close — discards the entire session.
  function closeOverlay() {
    removeOverlayDom();
    endSession();
  }

  function endSession() {
    MarkupCanvas.destroy();
    capturedScreenshots = [];
    savedFormData       = null;
    editingIndex        = null;
    submittingSession   = false;
    currentRawImage     = null;
    clearSession();
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
