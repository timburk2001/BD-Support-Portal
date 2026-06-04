(function () {
  'use strict';

  if (!window.SupportPortalConfig) return;

  var cfg               = window.SupportPortalConfig;
  var triggerBtn;
  var capturedScreenshots = []; // finalized flat JPEGs from previous captures

  // ── Init ───────────────────────────────────────────────────────────────────

  function boot() {
    triggerBtn = document.createElement('button');
    triggerBtn.id        = 'sp-trigger';
    triggerBtn.className = 'sp-trigger sp-pos-' + (cfg.buttonPosition || 'bottom-right');
    triggerBtn.setAttribute('aria-label', cfg.buttonText || 'Report an issue');
    triggerBtn.textContent = cfg.buttonText || 'Report an issue';
    document.body.appendChild(triggerBtn);
    triggerBtn.addEventListener('click', startCapture);
  }

  // ── Initial capture (triggered from floating button) ──────────────────────

  function startCapture() {
    capturedScreenshots = [];
    triggerBtn.disabled    = true;
    triggerBtn.textContent = 'Capturing…';

    captureViewport(null)
      .then(function (jpegDataUrl) {
        openOverlay(jpegDataUrl);
      })
      .catch(function (err) {
        console.error('[SupportPortal] html2canvas error:', err);
        showToast('Could not capture screenshot. Please try again.', 'error');
      })
      .then(function () {
        triggerBtn.disabled    = false;
        triggerBtn.textContent = cfg.buttonText || 'Report an issue';
      });
  }

  // ── Core capture helper ────────────────────────────────────────────────────
  // ignoreEl: optional element to exclude (the overlay, when re-capturing)

  function captureViewport(ignoreEl) {
    var scrollX = window.scrollX || window.pageXOffset || 0;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var vpW     = window.innerWidth;
    var vpH     = window.innerHeight;

    var opts = {
      useCORS:    true,
      allowTaint: false,
      logging:    false,
    };

    if (ignoreEl) {
      opts.ignoreElements = function (el) {
        // Skip the overlay and the trigger button so they don't appear
        // in subsequent screenshots taken while the overlay is open.
        return el === ignoreEl || el === triggerBtn;
      };
    }

    return html2canvas(document.documentElement, opts)
      .then(function (fullCanvas) {
        var crop = document.createElement('canvas');
        crop.width  = vpW;
        crop.height = vpH;
        crop.getContext('2d').drawImage(
          fullCanvas, scrollX, scrollY, vpW, vpH, 0, 0, vpW, vpH
        );
        // JPEG at 0.85 keeps the payload well under the portal's 4 MB limit.
        return crop.toDataURL('image/jpeg', 0.85);
      });
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  function openOverlay(jpegDataUrl) {
    var overlay = document.createElement('div');
    overlay.id        = 'sp-overlay';
    overlay.innerHTML = overlayHTML();
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    initCanvas(jpegDataUrl);
    prefillUser();
    wireTools(overlay);
    wireSubmit();
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
      '    <canvas id="sp-markup-canvas"></canvas>',
      '  </div>',
      '  <aside class="sp-sidebar" role="complementary">',

      '    <div class="sp-sidebar-head">',
      '      <h2 class="sp-sidebar-title">Report an issue</h2>',
      '      <button type="button" id="sp-close" class="sp-close" aria-label="Close">&times;</button>',
      '    </div>',

      // Screenshot counter + thumbnails (hidden until a second capture)
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
      '      <button type="button" id="sp-add-screenshot" class="sp-add-screenshot-btn" title="Capture another screenshot to include in this ticket">',
      '        + Add screenshot',
      '      </button>',
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
      '    </form>',
      '  </aside>',
      '</div>',
    ].join('\n');
  }

  // ── Canvas init / re-init ──────────────────────────────────────────────────

  function initCanvas(jpegDataUrl) {
    var canvasArea = document.getElementById('sp-canvas-area');
    var areaW = canvasArea ? canvasArea.clientWidth : window.innerWidth - 360;
    MarkupCanvas.init(document.getElementById('sp-markup-canvas'), jpegDataUrl, areaW);
  }

  // ── Add another screenshot ─────────────────────────────────────────────────

  function addAnotherScreenshot() {
    var addBtn    = document.getElementById('sp-add-screenshot');
    var overlay   = document.getElementById('sp-overlay');

    // 1. Finalise the current annotated screenshot and save it.
    capturedScreenshots.push(MarkupCanvas.getDataUrl());
    MarkupCanvas.destroy();

    // 2. Show busy state.
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Capturing…'; }

    // 3. Capture the underlying page, ignoring the overlay element so it
    //    doesn't appear in the new screenshot.
    captureViewport(overlay)
      .then(function (jpegDataUrl) {
        // 4. Re-use the existing canvas element — init attaches to it fresh.
        initCanvas(jpegDataUrl);
        // Reset tool to rect for the new canvas.
        var toolBtns = document.querySelectorAll('.sp-tool[data-tool]');
        toolBtns.forEach(function (b) { b.classList.remove('sp-tool-active'); });
        var rectBtn = document.querySelector('.sp-tool[data-tool="rect"]');
        if (rectBtn) rectBtn.classList.add('sp-tool-active');
        MarkupCanvas.setTool('rect');
        // 5. Update sidebar info.
        refreshScreenshotInfo();
      })
      .catch(function (err) {
        console.error('[SupportPortal] re-capture error:', err);
        // Restore the previous screenshot so the user isn't left with a blank canvas.
        var prev = capturedScreenshots.pop();
        if (prev) initCanvas(prev);
        showToast('Could not capture screenshot.', 'error');
      })
      .then(function () {
        if (addBtn) { addBtn.disabled = false; addBtn.textContent = '+ Add screenshot'; }
      });
  }

  // ── Screenshot counter + thumbnails ───────────────────────────────────────

  function refreshScreenshotInfo() {
    var info    = document.getElementById('sp-screenshot-info');
    var counter = document.getElementById('sp-screenshot-counter');
    var strip   = document.getElementById('sp-thumbnail-strip');
    if (!info || !counter || !strip) return;

    var total = capturedScreenshots.length + 1; // +1 = the one currently on the canvas

    if (total <= 1) {
      info.style.display = 'none';
      return;
    }

    info.style.display = 'block';
    counter.textContent = total + ' screenshots';

    // Rebuild thumbnail strip from the finalised (previous) screenshots.
    strip.innerHTML = '';
    capturedScreenshots.forEach(function (dataUrl, i) {
      var wrap = document.createElement('div');
      wrap.className = 'sp-thumb-wrap';
      wrap.title     = 'Screenshot ' + (i + 1) + ' (already saved)';

      var img     = document.createElement('img');
      img.src     = dataUrl;
      img.className = 'sp-thumbnail';
      img.alt     = 'Screenshot ' + (i + 1);

      var label     = document.createElement('span');
      label.className = 'sp-thumb-label';
      label.textContent = i + 1;

      wrap.appendChild(img);
      wrap.appendChild(label);
      strip.appendChild(wrap);
    });

    // Add a "current" placeholder thumbnail.
    var curWrap       = document.createElement('div');
    curWrap.className = 'sp-thumb-wrap sp-thumb-current';
    curWrap.title     = 'Screenshot ' + total + ' (current)';
    var curLabel      = document.createElement('span');
    curLabel.className = 'sp-thumb-label';
    curLabel.textContent = total + ' ✏';
    curWrap.appendChild(curLabel);
    strip.appendChild(curWrap);
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

    var addBtn = document.getElementById('sp-add-screenshot');
    if (addBtn) addBtn.addEventListener('click', addAnotherScreenshot);
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

    // Collect all screenshots: finalised ones + the current canvas.
    var allScreenshots = capturedScreenshots.concat([MarkupCanvas.getDataUrl()]);

    var payload = {
      title:                title,
      description:          description,
      submitter_name:       name,
      submitter_email:      email,
      page_url:             window.location.href,
      browser:              navigator.userAgent,
      device:               navigator.userAgent,
      viewport:             window.innerWidth + 'x' + window.innerHeight,
      // Always send as array; portal accepts both singular and array.
      annotated_screenshots: allScreenshots,
    };

    // POST to local WP REST proxy — API key stays server-side.
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

  // ── Close ──────────────────────────────────────────────────────────────────

  function wireClose() {
    var closeBtn = document.getElementById('sp-close');
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
  }

  function closeOverlay() {
    var overlay = document.getElementById('sp-overlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
    MarkupCanvas.destroy();
    capturedScreenshots = [];
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
