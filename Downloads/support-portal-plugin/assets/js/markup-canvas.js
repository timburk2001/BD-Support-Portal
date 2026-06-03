/**
 * MarkupCanvas — vanilla JS annotation engine.
 * Exposed as a global so support-portal.js can call it after enqueue ordering.
 */
var MarkupCanvas = (function () {
  'use strict';

  var canvas, ctx, bgImage;
  var annotations = [];
  var pinSeq = 0;          // monotonically increasing; never decremented (undo handles display)
  var currentTool = 'rect';
  var isDrawing = false;
  var dragStart = null;    // { x, y } in canvas coords
  var activeTextInput = null;

  // ── Public API ────────────────────────────────────────────────────────────

  function init(canvasEl, screenshotDataUrl, canvasWidth) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');

    bgImage     = new Image();
    bgImage.onload = function () {
      var ratio    = bgImage.naturalHeight / bgImage.naturalWidth;
      canvas.width  = canvasWidth;
      canvas.height = Math.round(canvasWidth * ratio);
      canvas.style.width  = canvas.width  + 'px';
      canvas.style.height = canvas.height + 'px';
      redraw();
    };
    bgImage.src = screenshotDataUrl;

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('click',     onClick);

    // Touch support
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
  }

  function setTool(tool) {
    currentTool = tool;
    if (canvas) {
      canvas.style.cursor = tool === 'eraser' ? 'crosshair'
                          : tool === 'rect'   ? 'crosshair'
                          : 'pointer';
    }
    dismissTextInput();
  }

  function undo() {
    if (annotations.length === 0) return;
    annotations.pop();
    // Recalculate pin sequence from remaining annotations so new pins
    // are numbered starting after the highest still-visible pin.
    pinSeq = annotations.reduce(function (max, a) {
      return a.type === 'pin' ? Math.max(max, a.num) : max;
    }, 0);
    redraw();
  }

  function getDataUrl() {
    if (!canvas) return '';
    // Flatten annotated canvas to JPEG for the ingest payload.
    return canvas.toDataURL('image/jpeg', 0.85);
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
    pinSeq      = 0;
    isDrawing   = false;
    dragStart   = null;
    canvas      = null;
    ctx         = null;
    bgImage     = null;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  function redraw(previewRect) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

    annotations.forEach(drawAnnotation);

    // Live rect preview while dragging
    if (previewRect) {
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth   = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
      ctx.restore();
    }
  }

  function drawAnnotation(a) {
    ctx.save();
    switch (a.type) {
      case 'rect':
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth   = 2;
        ctx.strokeRect(a.x, a.y, a.w, a.h);
        break;

      case 'pin':
        drawPin(a.x, a.y, a.num);
        break;

      case 'text':
        ctx.font         = 'bold 14px -apple-system, sans-serif';
        ctx.fillStyle    = '#fff';
        var metrics      = ctx.measureText(a.text);
        var pad          = 4;
        var boxH         = 20;
        ctx.fillStyle    = 'rgba(29, 78, 216, 0.85)';
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(a.x - pad, a.y - boxH + pad, metrics.width + pad * 2, boxH, 3)
          : ctx.rect(a.x - pad, a.y - boxH + pad, metrics.width + pad * 2, boxH);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(a.text, a.x, a.y);
        break;
    }
    ctx.restore();
  }

  function drawPin(x, y, num) {
    var r = 11;
    // Circle
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Stem
    ctx.beginPath();
    ctx.moveTo(x - 5, y + r - 3);
    ctx.lineTo(x + 5, y + r - 3);
    ctx.lineTo(x,     y + r + 6);
    ctx.closePath();
    ctx.fill();
    // Number
    ctx.fillStyle    = '#fff';
    ctx.font         = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), x, y);
    ctx.textAlign    = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Mouse events ──────────────────────────────────────────────────────────

  function onMouseDown(e) {
    if (currentTool === 'rect') {
      isDrawing = true;
      dragStart = canvasPos(e);
    } else if (currentTool === 'eraser') {
      eraseAt(canvasPos(e));
    }
  }

  function onMouseMove(e) {
    if (!isDrawing || currentTool !== 'rect' || !dragStart) return;
    var pos = canvasPos(e);
    redraw({ x: dragStart.x, y: dragStart.y, w: pos.x - dragStart.x, h: pos.y - dragStart.y });
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentTool === 'rect' && dragStart) {
      var pos = canvasPos(e);
      var w   = pos.x - dragStart.x;
      var h   = pos.y - dragStart.y;
      if (Math.abs(w) > 4 && Math.abs(h) > 4) {
        annotations.push({ type: 'rect', x: dragStart.x, y: dragStart.y, w: w, h: h });
      }
      dragStart = null;
      redraw();
    }
  }

  function onClick(e) {
    // Rect is handled by mousedown/up; skip click after a drag.
    if (currentTool === 'rect') return;

    var pos = canvasPos(e);
    if (currentTool === 'pin') {
      pinSeq++;
      annotations.push({ type: 'pin', x: pos.x, y: pos.y, num: pinSeq });
      redraw();
    } else if (currentTool === 'text') {
      showTextInput(pos, e);
    }
  }

  // ── Touch events (thin wrappers) ──────────────────────────────────────────

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
    // Fire both mouseup (for rect) and click (for pin/text/eraser).
    onMouseUp({ clientX: t.clientX, clientY: t.clientY });
    if (!isDrawing) {
      onClick({ clientX: t.clientX, clientY: t.clientY });
    }
  }

  // ── Text input overlay ────────────────────────────────────────────────────

  function showTextInput(canvasCoords, originEvent) {
    dismissTextInput();

    var input        = document.createElement('input');
    input.type       = 'text';
    input.className  = 'sp-text-input';
    input.placeholder = 'Type note, Enter to place';
    // Position at the pointer location (viewport coords).
    input.style.left = originEvent.clientX + 'px';
    input.style.top  = (originEvent.clientY - 2) + 'px';
    document.body.appendChild(input);
    activeTextInput = input;
    input.focus();

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var txt = input.value.trim();
        if (txt) {
          annotations.push({ type: 'text', x: canvasCoords.x, y: canvasCoords.y, text: txt });
          redraw();
        }
        dismissTextInput();
      } else if (e.key === 'Escape') {
        dismissTextInput();
      }
    });

    input.addEventListener('blur', dismissTextInput);
  }

  function dismissTextInput() {
    if (activeTextInput) {
      activeTextInput.removeEventListener('blur', dismissTextInput);
      activeTextInput.remove();
      activeTextInput = null;
    }
  }

  // ── Eraser ────────────────────────────────────────────────────────────────

  function eraseAt(pos) {
    var HIT = 20;
    for (var i = annotations.length - 1; i >= 0; i--) {
      var a = annotations[i];
      var hit = false;

      if (a.type === 'rect') {
        var mx = a.x + a.w / 2;
        var my = a.y + a.h / 2;
        hit = pos.x >= a.x - HIT && pos.x <= a.x + a.w + HIT &&
              pos.y >= a.y - HIT && pos.y <= a.y + a.h + HIT;
      } else if (a.type === 'pin') {
        var dx = pos.x - a.x;
        var dy = pos.y - a.y;
        hit = Math.sqrt(dx * dx + dy * dy) <= HIT + 4;
      } else if (a.type === 'text') {
        hit = Math.abs(pos.x - a.x) <= HIT * 4 && Math.abs(pos.y - a.y) <= HIT;
      }

      if (hit) {
        annotations.splice(i, 1);
        redraw();
        return;
      }
    }
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  function canvasPos(e) {
    var rect   = canvas.getBoundingClientRect();
    var scaleX = canvas.width  / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top)  * scaleY),
    };
  }

  return { init: init, setTool: setTool, undo: undo, getDataUrl: getDataUrl, destroy: destroy };
}());
