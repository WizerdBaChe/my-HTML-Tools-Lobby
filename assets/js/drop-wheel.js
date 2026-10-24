/*
 * drop-wheel.js — lobby LAUNCHER feature (not tool logic).
 * While a file is dragged over the lobby, tapping Shift opens a radial picker
 * of the tools that accept that kind of file; dropping on a sector opens the
 * tool (new tab, so window.opener exists) and hands the files over by
 * postMessage. Without a file drag nothing in this file does anything.
 *
 * Handoff protocol (same origin only, checked both ways):
 *   tool  -> opener : { type: 'lobby-handoff-ready' }
 *   lobby -> tool   : { type: 'lobby-handoff', files: File[] }
 *
 * Needs drop-wheel-geom.js (window.DropWheelCore) loaded first.
 */
(function () {
  'use strict';

  var Core = window.DropWheelCore;
  if (!Core) { console.error('[drop-wheel] DropWheelCore missing; wheel disabled'); return; }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var HANDOFF_WAIT_MS = 15000;

  var tools = [];          // tools with accepts[], from tools.json
  var ready = false;
  var depth = 0;           // dragenter/dragleave balance
  var dragging = false;
  var kind = 'unknown';
  var list = [];           // tools shown for the current kind
  var page = 0;
  var wheelOpen = false;
  var prevShift = null;    // null until first dragover of a drag (no edge on the first sample)
  var cursor = { x: 0, y: 0 };
  var center = { x: 0, y: 0 };
  var radius = 220;
  var hover = -1;
  var hintEl, wheelEl, backdropEl, toastEl, svgEl, centerEl, titleEl, descEl, noteEl, pageEl;
  var sectorEls = [], labelEls = [];

  /* ── data ─────────────────────────────────────────────── */

  function loadTools() {
    var url = new URL('tools.json', document.baseURI).href;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (all) {
      tools = all.filter(function (t) {
        return Array.isArray(t.accepts) && t.accepts.length && typeof t.path === 'string' && !/^https?:/i.test(t.path);
      });
      ready = true;
    }).catch(function (err) {
      console.error('[drop-wheel] could not load tools.json; wheel disabled', err);
    });
  }

  /* ── DOM ──────────────────────────────────────────────── */

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function build() {
    hintEl = el('div', 'dw-hint', document.body);
    hintEl.textContent = '按一下 Shift 叫出輪盤';
    hintEl.hidden = true;
    backdropEl = el('div', 'dw-backdrop', document.body);
    backdropEl.hidden = true;
    wheelEl = el('div', 'dw-wheel', document.body);
    wheelEl.hidden = true;
    wheelEl.setAttribute('role', 'presentation');
    svgEl = document.createElementNS(SVGNS, 'svg');
    svgEl.setAttribute('class', 'dw-svg');
    wheelEl.appendChild(svgEl);
    centerEl = el('div', 'dw-center', wheelEl);
    titleEl = el('div', 'dw-center__title', centerEl);
    descEl = el('div', 'dw-center__desc', centerEl);
    noteEl = el('div', 'dw-center__note', centerEl);
    pageEl = el('div', 'dw-center__page', centerEl);
    toastEl = el('div', 'dw-toast', document.body);
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.hidden = true;
  }

  function polarPoint(deg, d) {
    var a = deg * Math.PI / 180;
    return { x: radius + Math.sin(a) * d, y: radius - Math.cos(a) * d };
  }

  function sectorPath(i) {
    var inner = radius * 0.5, outer = radius, gap = 1.2;
    var a0 = i * 45 - 22.5 + gap, a1 = i * 45 + 22.5 - gap;
    var p0 = polarPoint(a0, outer), p1 = polarPoint(a1, outer);
    var p2 = polarPoint(a1, inner), p3 = polarPoint(a0, inner);
    return 'M' + p0.x + ' ' + p0.y + ' A' + outer + ' ' + outer + ' 0 0 1 ' + p1.x + ' ' + p1.y +
           ' L' + p2.x + ' ' + p2.y + ' A' + inner + ' ' + inner + ' 0 0 0 ' + p3.x + ' ' + p3.y + ' Z';
  }

  /** (Re)build sector shapes + labels for the current page and radius. */
  function renderWheel() {
    var slots = Core.pageSlots(list, page);
    var size = radius * 2;
    wheelEl.style.width = size + 'px';
    wheelEl.style.height = size + 'px';
    wheelEl.style.left = (center.x - radius) + 'px';
    wheelEl.style.top = (center.y - radius) + 'px';
    svgEl.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svgEl.setAttribute('width', size);
    svgEl.setAttribute('height', size);
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    labelEls.forEach(function (l) { l.remove(); });
    sectorEls = []; labelEls = [];
    // Side sectors are only (outer - inner) wide horizontally; keep a margin so
    // long names wrap inside the ring instead of touching its edge.
    var cw = Math.max(64, radius * 0.4);
    for (var i = 0; i < Core.SECTORS; i++) {
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', sectorPath(i));
      p.setAttribute('class', 'dw-sector' + (slots[i] ? '' : ' is-empty'));
      p.setAttribute('data-sector', i);
      svgEl.appendChild(p);
      sectorEls.push(p);
      var lab = el('div', 'dw-label' + (slots[i] ? '' : ' is-empty'), wheelEl);
      var pt = polarPoint(i * 45, radius * 0.75);
      lab.style.left = pt.x + 'px';
      lab.style.top = pt.y + 'px';
      lab.style.width = cw + 'px';
      lab.textContent = slots[i] ? slots[i].name : '';
      labelEls.push(lab);
    }
    var pages = Core.pageCount(list.length);
    pageEl.textContent = pages > 1 ? (page + 1) + ' / ' + pages + '　再按 Shift 換頁' : '';
    centerEl.style.width = radius + 'px';
    centerEl.style.height = radius + 'px';
    applyHover(true);
  }

  function slotTool(i) {
    return i < 0 ? null : Core.pageSlots(list, page)[i];
  }

  function applyHover(force) {
    var idx = Core.sectorAt(cursor.x - center.x, cursor.y - center.y, radius * 0.5);
    var t = slotTool(idx);
    var eff = t ? idx : -1;               // empty sectors are not selectable
    if (!force && eff === hover) return;
    hover = eff;
    sectorEls.forEach(function (s, i) { s.classList.toggle('is-hover', i === hover); });
    labelEls.forEach(function (l, i) { l.classList.toggle('is-hover', i === hover); });
    if (t) {
      titleEl.textContent = t.name;
      descEl.textContent = t.description || '';
      noteEl.textContent = t.handoff ? '放開即開啟並帶入檔案' : '開啟後請再選一次檔案';
    } else {
      titleEl.textContent = kindLabel(kind);
      descEl.textContent = '往工具的方向放開';
      noteEl.textContent = '在中央放開＝取消';
    }
  }

  function kindLabel(k) {
    return { image: '圖片', svg: 'SVG', 'json-csv': 'JSON / CSV', 'text-code': '文字／程式碼', other: '其他檔案', unknown: '檔案', mixed: '多種檔案' }[k] || '檔案';
  }

  /* ── state transitions ────────────────────────────────── */

  function inferKind(dt) {
    var kinds = [];
    var items = dt && dt.items ? dt.items : [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') kinds.push(Core.kindFromType(items[i].type));
    }
    return Core.combineKinds(kinds);
  }

  function hasFiles(dt) {
    if (!dt || !dt.types) return false;
    return Array.prototype.indexOf.call(dt.types, 'Files') >= 0;
  }

  function openWheel() {
    if (wheelOpen || !list.length) return;
    wheelOpen = true;
    page = 0;
    radius = Core.wheelRadius(window.innerWidth, window.innerHeight);
    center = Core.placeWheel(cursor, { w: window.innerWidth, h: window.innerHeight }, radius, 8);
    hintEl.hidden = true;
    backdropEl.hidden = false;
    wheelEl.hidden = false;
    document.documentElement.classList.add('dw-open');
    renderWheel();
  }

  function closeWheel() {
    wheelOpen = false;
    hover = -1;
    backdropEl.hidden = true;
    wheelEl.hidden = true;
    document.documentElement.classList.remove('dw-open');
  }

  function endDrag() {
    dragging = false;
    depth = 0;
    prevShift = null;
    hintEl.hidden = true;
    closeWheel();
  }

  function flipPage() {
    var pages = Core.pageCount(list.length);
    if (pages < 2) return;
    page = (page + 1) % pages;
    renderWheel();
  }

  function onShiftTap() {
    if (!dragging || !ready) return;
    if (wheelOpen) flipPage(); else openWheel();
  }

  function placeHint() {
    var w = hintEl.offsetWidth || 160, h = hintEl.offsetHeight || 28;
    var x = Math.min(Math.max(8, cursor.x + 16), window.innerWidth - w - 8);
    var y = Math.min(Math.max(8, cursor.y + 22), window.innerHeight - h - 8);
    hintEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  /* ── events ───────────────────────────────────────────── */

  function onDragEnter(e) {
    if (!ready || !hasFiles(e.dataTransfer)) return;
    depth++;
    if (!dragging) {
      dragging = true;
      prevShift = null;
      kind = inferKind(e.dataTransfer);
      list = Core.toolsFor(tools, kind);
    }
  }

  var raf = 0;
  function onDragOver(e) {
    if (!dragging || !hasFiles(e.dataTransfer)) return;
    cursor.x = e.clientX; cursor.y = e.clientY;
    if (prevShift === false && e.shiftKey) onShiftTap();   // false -> true edge only
    prevShift = !!e.shiftKey;
    if (wheelOpen) {
      e.preventDefault();                 // required for the drop to be delivered to us
      e.dataTransfer.dropEffect = 'copy';
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (wheelOpen) applyHover(false); });
    } else if (list.length) {
      hintEl.hidden = false;
      placeHint();
    }
  }

  function onDragLeave() {
    if (!dragging) return;
    depth--;
    if (depth <= 0) endDrag();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && (wheelOpen || dragging)) { endDrag(); return; }
    if (e.key === 'Shift' && !e.repeat) onShiftTap();   // some browsers deliver it mid-drag
  }

  function onDrop(e) {
    if (!wheelOpen) { endDrag(); return; }
    e.preventDefault();
    cursor.x = e.clientX; cursor.y = e.clientY;
    applyHover(true);                      // evaluate the drop position, not the last rAF
    var tool = slotTool(hover);
    var files = Array.prototype.slice.call(e.dataTransfer.files || []);
    endDrag();
    if (!tool || !files.length) return;    // dead zone / empty sector = cancel
    // names are readable now: re-filter what the guess could not know
    var kinds = files.map(function (f) { return f.type ? Core.kindFromType(f.type) : Core.kindFromName(f.name); });
    if (!Core.toolTakesAny(tool, kinds)) {
      showToast('「' + tool.name + '」不處理這類檔案，已取消');
      return;
    }
    launch(tool, files);
  }

  /* ── launch + handoff ─────────────────────────────────── */

  function toolUrl(tool) { return new URL(tool.path, document.baseURI).href; }

  function launch(tool, files) {
    var url = toolUrl(tool);
    // New tab on purpose: window.opener is what the handoff rides on, and the
    // lobby (with its search state) stays where the user left it.
    var win = window.open(url, '_blank');
    if (!win) {
      showToast('瀏覽器擋下了新分頁', '開啟「' + tool.name + '」', function () { launch(tool, files); });
      return;
    }
    if (!tool.handoff) { showToast('已開啟「' + tool.name + '」，請在新分頁再選一次檔案'); return; }
    waitForReady(win, files, tool);
  }

  function waitForReady(win, files, tool) {
    var done = false;
    function cleanup() { done = true; window.removeEventListener('message', onMsg); clearTimeout(timer); }
    function onMsg(ev) {
      if (done || ev.origin !== location.origin || ev.source !== win) return;
      if (!ev.data || ev.data.type !== 'lobby-handoff-ready') return;
      win.postMessage({ type: 'lobby-handoff', files: files }, location.origin);
      cleanup();
    }
    var timer = setTimeout(function () {
      if (done) return;
      cleanup();
      console.error('[drop-wheel] handoff timed out for', tool.id);
      showToast('「' + tool.name + '」沒有回應，請在新分頁再選一次檔案');
    }, HANDOFF_WAIT_MS);
    window.addEventListener('message', onMsg);
  }

  var toastTimer = 0;
  function showToast(msg, actionLabel, action) {
    toastEl.textContent = msg;
    if (actionLabel) {
      var b = el('button', 'dw-toast__btn', toastEl);
      b.type = 'button';
      b.textContent = actionLabel;
      b.addEventListener('click', function () { toastEl.hidden = true; action(); });
    }
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, actionLabel ? 12000 : 4500);
  }

  /* ── boot ─────────────────────────────────────────────── */

  function init() {
    build();
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    document.addEventListener('keydown', onKeyDown);
    loadTools();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
