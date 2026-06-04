/**
 * MarkupCanvas — vanilla JS annotation engine.
 * Exposed as a global so support-portal.js can call it after enqueue ordering.
 *
 * Tools: pin (numbered comment), rect, circle, arrow.
 * ALL annotation types carry { num, comment } — comments are required and
 * displayed in the sidebar annotation list, not on the canvas itself.
 * Annotations are stored in IMAGE-PIXEL coordinates (canvas sized to the
 * captured image, CSS-scaled for display), so flattening at any size needs
 * no coordinate rescaling.
 */
var MarkupCanvas = (function () {
  'use strict';

  var MAX_W = 1600;
  var RED   = '#ef4444';

  var canvas, ctx, bgImage;
  var annotations = [];
  var annSeq = 0;           // monotonically increasing across ALL annotation types
  var currentTool = 'pin';
  var isDrawing = false;
  var dragStart = null;     // { x, y } in canvas (image) coords
  var activeTextInput = null;
  var onchange = null;      // callback(annotations[]) fired after every mutation

  var DRAG_TOOLS = { rect: 1, circle: 1, arrow: 1 };

  // ── Public API ────────────────────────────────────────────────────────────

  function init(canvasEl, imageDataUrl, initialAnnotations, onchangeFn) {
    canvas   = canvasEl;
    ctx      = canvas.getContext('2d');
    onchange = onchangeFn || null;

    annotations = Array.isArray(initialAnnotations) ? initialAnnotations.map(cloneAnn) : [];
    annSeq = annotations.reduce(function (m, a) {
      return a.num ? Math.max(m, a.num) : m;
    }, 0);

    bgImage = new Image();
    bgImage.onload = function () {
      var natural = bgImage.naturalWidth || 1;
      var w       = Math.min(natural, MAX_W);
      var ratio   = (bgImage.naturalHeight || 1) / natural;
      canvas.width  = w;
      canvas.height = Math.round(w * ratio);
      redraw();
      // Populate the sidebar with any initial annotations loaded for editing.
      if (onchange) onchange(annotations.map(cloneAnn));
    };
    bgImage.src = imageDataUrl;

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('click',     onClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
  }

  function setTool(tool) {
    currentTool = tool;
    if (canvas) canvas.style.cursor = (tool === 'pin') ? 'pointer' : 'crosshair';
    dismissTextInput();
  }

  function getDataUrl() {
    if (!canvas) return '';
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  function getState() {
    return { annotations: annotations.map(cloneAnn) };
  }

  // Remove the annotation at index i; fires onchange.
  function removeAnnotationAt(i) {
    if (isNaN(i) || i < 0 || i >= annotations.length) return;
    annotations.splice(i, 1);
    annSeq = annotations.reduce(function (m, a) {
      return a.num ? Math.max(m, a.num) : m;
    }, 0);
    redraw();
    if (onchange) onchange(annotations.map(cloneAnn));
  }

  // Update the comment on annotation i; fires onchange.
  function editAnnotationComment(i, comment) {
    if (i < 0 || i >= annotations.length) return;
    annotations[i].comment = comment;
    if (onchange) onchange(annotations.map(cloneAnn));
  }

  function destroy() {
    dismissTextInput();
    if (canvas) {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup',   onMouseUp);
      canvas.removeEventListener('click',     onClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    }
    annotations = [];
    annSeq      = 0;
    isDrawing   = false;
    dragStart   = null;
    onchange    = null;
    canvas      = null;
    ctx         = null;
    bgImage     = null;
  }

  // Off-screen flatten of image + annotations → JPEG data URL (Promise).
  function flatten(imageDataUrl, anns, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var natural   = img.naturalWidth || 1;
        var authoredW = Math.min(natural, MAX_W);
        var cap       = opts.maxWidth || MAX_W;
        var targetW   = Math.min(natural, cap);
        var ratio     = (img.naturalHeight || 1) / natural;

        var c  = document.createElement('canvas');
        c.width  = targetW;
        c.height = Math.round(targetW * ratio);
        var fc = c.getContext('2d');
        fc.drawImage(img, 0, 0, c.width, c.height);

        var s = targetW / authoredW;
        fc.save();
        fc.scale(s, s);
        (anns || []).forEach(function (a) { drawAnnotationOn(fc, a); });
        fc.restore();

        resolve(c.toDataURL('image/jpeg', opts.quality || 0.85));
      };
      img.onerror = reject;
      img.src = imageDataUrl;
    });
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  function redraw(preview) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgImage) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    annotations.forEach(function (a) { drawAnnotationOn(ctx, a); });
    if (preview) drawPreviewOn(ctx, preview);
  }

  function drawAnnotationOn(c, a) {
    c.save();
    if      (a.type === 'rect')   drawRectOn(c, a);
    else if (a.type === 'circle') drawCircleOn(c, a);
    else if (a.type === 'arrow')  drawArrowOn(c, a);
    else if (a.type === 'pin')    drawPinOn(c, a.x, a.y, a.num);
    c.restore();
  }

  function drawPreviewOn(c, p) {
    c.save();
    if      (p.kind === 'rect')   drawRectOn(c, p);
    else if (p.kind === 'circle') drawCircleOn(c, p);
    else if (p.kind === 'arrow')  drawArrowOn(c, p);
    c.restore();
  }

  function drawRectOn(c, a) {
    c.strokeStyle = RED;
    c.lineWidth   = 2;
    c.strokeRect(a.x, a.y, a.w, a.h);
  }

  function drawCircleOn(c, a) {
    var cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    var rx = Math.abs(a.w) / 2, ry = Math.abs(a.h) / 2;
    c.strokeStyle = RED;
    c.lineWidth   = 2;
    if (c.ellipse) {
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.save();
      c.beginPath();
      c.translate(cx, cy);
      c.scale(Math.max(rx, 0.01), Math.max(ry, 0.01));
      c.arc(0, 0, 1, 0, Math.PI * 2);
      c.restore();
      c.stroke();
    }
  }

  function drawArrowOn(c, a) {
    var angle   = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
    var headLen = 14;
    var headAng = Math.PI / 7;
    c.strokeStyle = RED;
    c.fillStyle   = RED;
    c.lineWidth   = 2;
    c.beginPath();
    c.moveTo(a.x1, a.y1);
    c.lineTo(a.x2, a.y2);
    c.stroke();
    c.beginPath();
    c.moveTo(a.x2, a.y2);
    c.lineTo(a.x2 - headLen * Math.cos(angle - headAng), a.y2 - headLen * Math.sin(angle - headAng));
    c.lineTo(a.x2 - headLen * Math.cos(angle + headAng), a.y2 - headLen * Math.sin(angle + headAng));
    c.closePath();
    c.fill();
  }

  function drawPinOn(c, x, y, num) {
    var r = 11;
    c.fillStyle = RED;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x - 5, y + r - 3);
    c.lineTo(x + 5, y + r - 3);
    c.lineTo(x,     y + r + 6);
    c.closePath();
    c.fill();
    c.fillStyle    = '#fff';
    c.font         = 'bold 11px -apple-system, sans-serif';
    c.textAlign    = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(num), x, y);
    c.textAlign    = 'start';
    c.textBaseline = 'alphabetic';
  }

  // ── Mouse events ─────────────────────────────────────────────────────────────

  function onMouseDown(e) {
    if (DRAG_TOOLS[currentTool]) {
      isDrawing = true;
      dragStart = canvasPos(e);
    }
  }

  function onMouseMove(e) {
    if (!isDrawing || !DRAG_TOOLS[currentTool] || !dragStart) return;
    redraw(buildPreview(currentTool, dragStart, canvasPos(e)));
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    if (DRAG_TOOLS[currentTool] && dragStart) {
      var ann = commitDrag(currentTool, dragStart, canvasPos(e));
      if (ann) {
        annSeq++;
        ann.num     = annSeq;
        ann.comment = '';
        annotations.push(ann);
        redraw();
        // Comment is required — the prompt will remove the annotation if left empty.
        showCommentInput(e, ann);
      } else {
        redraw(); // clear the preview stroke
      }
      dragStart = null;
    }
  }

  function onClick(e) {
    if (DRAG_TOOLS[currentTool]) return;
    if (currentTool === 'pin') {
      var pos = canvasPos(e);
      annSeq++;
      var pin = { type: 'pin', x: pos.x, y: pos.y, num: annSeq, comment: '' };
      annotations.push(pin);
      redraw();
      showCommentInput(e, pin);
    }
  }

  function buildPreview(tool, start, pos) {
    if (tool === 'arrow') {
      return { kind: 'arrow', x1: start.x, y1: start.y, x2: pos.x, y2: pos.y };
    }
    return { kind: tool, x: start.x, y: start.y, w: pos.x - start.x, h: pos.y - start.y };
  }

  function commitDrag(tool, start, pos) {
    if (tool === 'arrow') {
      var dx = pos.x - start.x, dy = pos.y - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        return { type: 'arrow', x1: start.x, y1: start.y, x2: pos.x, y2: pos.y };
      }
      return null;
    }
    var w = pos.x - start.x, h = pos.y - start.y;
    if (Math.abs(w) > 4 && Math.abs(h) > 4) {
      return { type: tool, x: start.x, y: start.y, w: w, h: h };
    }
    return null;
  }

  // ── Touch events (thin wrappers) ─────────────────────────────────────────────

  function onTouchStart(e) {
    e.preventDefault();
    var t = e.touches[0];
    onMouseDown({ clientX: t.clientX, clientY: t.clientY });
  }

  function onTouchMove(e) {
    e.preventDefault();
    var t = e.touches[0];
    onMouseMove({ clientX: t.clientX, clientY: t.clientY });
  }

  function onTouchEnd(e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    onMouseUp({ clientX: t.clientX, clientY: t.clientY });
    if (!isDrawing) {
      onClick({ clientX: t.clientX, clientY: t.clientY });
    }
  }

  // ── Annotation comment input ──────────────────────────────────────────────────
  // Comment is REQUIRED. If the user dismisses with an empty value the annotation
  // is removed so no uncommented marks can be saved.

  function showCommentInput(originEvent, ann) {
    dismissTextInput();

    var input         = document.createElement('input');
    input.type        = 'text';
    input.className   = 'sp-text-input';
    input.placeholder = 'Describe this annotation (required)';
    input.value       = ann.comment || '';
    input.style.left  = originEvent.clientX + 'px';
    input.style.top   = (originEvent.clientY - 2) + 'px';
    document.body.appendChild(input);
    activeTextInput = input;
    setTimeout(function () { input.focus(); }, 0);

    var committed = false;
    function finish(save) {
      if (committed) return;
      committed = true;
      var text = save ? input.value.trim() : '';
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      if (input.parentNode) input.parentNode.removeChild(input);
      if (activeTextInput === input) activeTextInput = null;

      if (text) {
        ann.comment = text;
      } else {
        // No comment provided — remove the annotation entirely.
        var idx = annotations.indexOf(ann);
        if (idx !== -1) {
          annotations.splice(idx, 1);
          annSeq = annotations.reduce(function (m, a) {
            return a.num ? Math.max(m, a.num) : m;
          }, 0);
        }
      }
      redraw();
      if (onchange) onchange(annotations.map(cloneAnn));
    }

    function onKey(ev) {
      if (ev.key === 'Enter')       { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    }
    function onBlur() { finish(true); }

    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
  }

  function dismissTextInput() {
    if (activeTextInput) {
      var el = activeTextInput;
      activeTextInput = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────────

  function canvasPos(e) {
    var rect   = canvas.getBoundingClientRect();
    var scaleX = canvas.width  / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top)  * scaleY),
    };
  }

  function cloneAnn(a) {
    var o = {};
    for (var k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; }
    return o;
  }

  return {
    init:                 init,
    setTool:              setTool,
    getDataUrl:           getDataUrl,
    getState:             getState,
    removeAnnotationAt:   removeAnnotationAt,
    editAnnotationComment: editAnnotationComment,
    flatten:              flatten,
    destroy:              destroy,
  };
}());
