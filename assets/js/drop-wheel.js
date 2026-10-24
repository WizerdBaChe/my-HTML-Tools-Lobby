/*
 * drop-wheel.js — lobby LAUNCHER feature (not tool logic).
 * While a file is dragged over the lobby, tapping Shift opens a radial picker
 * of the tools that accept that kind of file; dropping on a sector opens the
 * tool (new tab, so window.opener exists) and hands the files over by
 * postMessage. Without a file drag nothing in this file does anything.
 *
 * Model: level 1 = 8 FIXED slots (N, NE, ... NW; index 0 = N, clockwise) filled
 * from a per-file-kind loadout (localStorage, editable in drop-wheel-config.js).
 * A slot may hold a group; flinging past 1.3 x outer radius in its direction
 * expands a same-shape level-2 wheel at the crossing point.
 *
 * Handoff protocol (same origin only, checked both ways):
 *   tool  -> opener : { type: 'lobby-handoff-ready' }
 *   lobby -> tool   : { type: 'lobby-handoff', files: File[] }
 *
 * Needs drop-wheel-geom.js (window.DropWheelCore) loaded first.
 * Exposes window.DropWheel for the configuration dialog.
 */
(function () {
  'use strict';

  var Core = window.DropWheelCore;
  if (!Core) { console.error('[drop-wheel] DropWheelCore missing; wheel disabled'); return; }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var HANDOFF_WAIT_MS = 15000;
  var STORE_KEY = 'lobby.wheel.loadout.v1';

  var tools = [];          // tools with accepts[], from tools.json
  var toolsById = {};
  var ready = false;
  var readyWaiters = [];
  var depth = 0;           // dragenter/dragleave balance
  var dragging = false;
  var kind = 'unknown';
  var slots = [];          // 8 materialized slot items for the current drag
  var wheelOpen = false;
  var level = 1;
  var sub = null;          // { item, fromIdx, center, hover }
  var noExpandIdx = -1;    // after collapsing, don't re-expand until the pointer leaves
  var prevShift = null;    // null until first dragover of a drag (no edge on the first sample)
  var cursor = { x: 0, y: 0 };
  var radius = 220;
  var hover = -1;
  var hintEl, backdropEl, toastEl, w1, w2;

  /* ── loadout store (per viewer; must work when storage throws) ───────── */

  var mem = { v: 1, kinds: {} };
  var warned = {};
  function warnOnce(key, msg, extra) {
    if (warned[key]) return;
    warned[key] = true;
    console.warn('[drop-wheel] ' + msg, extra === undefined ? '' : extra);
  }

  function readStore() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORE_KEY); }
    catch (err) { warnOnce('read', 'localStorage unavailable; using default loadouts', err && err.name); return; }
    if (!raw) return;
    try {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object' && o.kinds && typeof o.kinds === 'object' && !Array.isArray(o.kinds)) {
        mem = { v: 1, kinds: o.kinds };
      } else {
        warnOnce('shape', 'stored loadout has an unexpected shape; using defaults');
      }
    } catch (err) {
      warnOnce('parse', 'stored loadout is not valid JSON; using defaults');
    }
  }

  function writeStore() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(mem)); }
    catch (err) { warnOnce('write', 'cannot persist loadout (storage blocked); change lasts for this page only', err && err.name); }
  }

  function library(key) { return Core.buildLibrary(tools, key); }

  function slotIds(key) {
    var lib = library(key);
    var r = Core.resolveLoadout(mem.kinds[key], lib);
    if (r.dropped.length) warnOnce('drop:' + key + ':' + r.dropped.join(','), 'stored loadout for "' + key + '" names items that are gone or no longer accept it; those slots are now empty:', r.dropped);
    return r.slots;
  }

  var API = {
    kinds: Core.LOADOUT_KINDS,
    whenReady: function (fn) { if (ready) fn(); else readyWaiters.push(fn); },
    library: library,
    slotIds: slotIds,
    slots: function (key) { return Core.materializeSlots(slotIds(key), library(key)); },
    setSlotIds: function (key, ids) { mem.kinds[key] = ids.slice(0, 8); writeStore(); },
    reset: function (key) { delete mem.kinds[key]; writeStore(); },
    isCustom: function (key) { return !!mem.kinds[key]; }
  };
  window.DropWheel = API;

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
      tools.forEach(function (t) { toolsById[t.id] = t; });
      readStore();
      ready = true;
      readyWaiters.splice(0).forEach(function (fn) { fn(); });
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

  /** One wheel (level 1 or level 2): SVG ring + labels + centre text. */
  function makeWheel(extraCls) {
    var w = { r: 220, cx: 0, cy: 0, sectors: [], labels: [] };
    w.root = el('div', 'dw-wheel ' + (extraCls || ''), document.body);
    w.root.hidden = true;
    w.root.setAttribute('role', 'presentation');
    w.svg = document.createElementNS(SVGNS, 'svg');
    w.svg.setAttribute('class', 'dw-svg');
    w.root.appendChild(w.svg);
    w.centerEl = el('div', 'dw-center', w.root);
    w.title = el('div', 'dw-center__title', w.centerEl);
    w.desc = el('div', 'dw-center__desc', w.centerEl);
    w.note = el('div', 'dw-center__note', w.centerEl);
    return w;
  }

  function polarPoint(r, deg, d) {
    var a = deg * Math.PI / 180;
    return { x: r + Math.sin(a) * d, y: r - Math.cos(a) * d };
  }

  function sectorPath(r, i) {
    var inner = r * 0.5, outer = r, gap = 1.2;
    var a0 = i * 45 - 22.5 + gap, a1 = i * 45 + 22.5 - gap;
    var p0 = polarPoint(r, a0, outer), p1 = polarPoint(r, a1, outer);
    var p2 = polarPoint(r, a1, inner), p3 = polarPoint(r, a0, inner);
    return 'M' + p0.x + ' ' + p0.y + ' A' + outer + ' ' + outer + ' 0 0 1 ' + p1.x + ' ' + p1.y +
           ' L' + p2.x + ' ' + p2.y + ' A' + inner + ' ' + inner + ' 0 0 0 ' + p3.x + ' ' + p3.y + ' Z';
  }

  /** Small outward chevron at a group sector's outer edge. */
  function chevronPath(r, i) {
    var tip = polarPoint(r, i * 45, r - 5), base = polarPoint(r, i * 45, r - 19);
    var a = i * 45 * Math.PI / 180, px = Math.cos(a) * 9, py = Math.sin(a) * 9;
    return 'M' + (base.x - px) + ' ' + (base.y - py) + ' L' + tip.x + ' ' + tip.y + ' L' + (base.x + px) + ' ' + (base.y + py);
  }

  /** (Re)build the wheel for 8 slot items (item | null) at centre (cx, cy). */
  function renderWheel(w, items, cx, cy, r) {
    w.r = r; w.cx = cx; w.cy = cy;
    var size = r * 2;
    w.root.style.width = size + 'px';
    w.root.style.height = size + 'px';
    w.root.style.left = (cx - r) + 'px';
    w.root.style.top = (cy - r) + 'px';
    w.svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    w.svg.setAttribute('width', size);
    w.svg.setAttribute('height', size);
    while (w.svg.firstChild) w.svg.removeChild(w.svg.firstChild);
    w.labels.forEach(function (l) { l.remove(); });
    w.sectors = []; w.labels = [];
    // Side sectors are only (outer - inner) wide horizontally; keep a margin so
    // long names wrap inside the ring instead of touching its edge.
    var cw = Math.max(64, r * 0.4);
    for (var i = 0; i < Core.SECTORS; i++) {
      var it = items[i];
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', sectorPath(r, i));
      p.setAttribute('class', 'dw-sector' + (it ? '' : ' is-empty'));
      p.setAttribute('data-sector', i);
      w.svg.appendChild(p);
      w.sectors.push(p);
      if (it && it.type === 'group') {
        var c = document.createElementNS(SVGNS, 'path');
        c.setAttribute('d', chevronPath(r, i));
        c.setAttribute('class', 'dw-chevron');
        w.svg.appendChild(c);
      }
      var lab = el('div', 'dw-label' + (it ? '' : ' is-empty') + (it && it.type === 'group' ? ' is-group' : ''), w.root);
      var pt = polarPoint(r, i * 45, r * 0.75);
      lab.style.left = pt.x + 'px';
      lab.style.top = pt.y + 'px';
      lab.style.width = cw + 'px';
      lab.textContent = it ? it.name : '';
      w.labels.push(lab);
    }
    w.centerEl.style.width = r + 'px';
    w.centerEl.style.height = r + 'px';
  }

  function setWheelHover(w, idx) {
    w.sectors.forEach(function (s, i) { s.classList.toggle('is-hover', i === idx); });
    w.labels.forEach(function (l, i) { l.classList.toggle('is-hover', i === idx); });
  }

  function build() {
    hintEl = el('div', 'dw-hint', document.body);
    hintEl.textContent = '按一下 Shift 叫出輪盤';
    hintEl.hidden = true;
    backdropEl = el('div', 'dw-backdrop', document.body);
    backdropEl.hidden = true;
    w1 = makeWheel('');
    w2 = makeWheel('dw-wheel--sub');
    toastEl = el('div', 'dw-toast', document.body);
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.hidden = true;
  }

  /* ── hover + centre text ──────────────────────────────── */

  function kindLabel(k) {
    return { image: '圖片', svg: 'SVG', 'json-csv': 'JSON / CSV', 'text-code': '文字／程式碼', other: '其他檔案', unknown: '檔案', mixed: '多種檔案' }[k] || '檔案';
  }

  function handoffNote(tool) { return tool && tool.handoff ? '放開即開啟並帶入檔案' : '開啟後請再選一次檔案'; }

  function setCenter(w, title, desc, note) {
    w.title.textContent = title; w.desc.textContent = desc; w.note.textContent = note;
  }

  /** Raw sector under the pointer for the active level (-1 = dead zone). */
  function rawIdx() {
    var w = level === 2 ? w2 : w1;
    return Core.slotAt(cursor.x - w.cx, cursor.y - w.cy, w.r * 0.5);
  }

  function applyHover(force) {
    if (level === 2 && sub) {
      var kids = sub.item.children;
      var ri = rawIdx();
      var eff2 = ri >= 0 && kids[ri] ? ri : -1;       // empty sub slots are not selectable
      if (!force && eff2 === sub.hover) return;
      sub.hover = eff2;
      setWheelHover(w2, eff2);
      if (eff2 >= 0) {
        var c = kids[eff2];
        setCenter(w2, c.name, c.description, handoffNote(c.tool));
      } else if (ri < 0) {
        var d = kids[0];
        setCenter(w2, sub.item.name, '放開＝開啟預設：' + (d ? d.name : ''), '再按 Shift 回上一層');
      } else {
        setCenter(w2, sub.item.name, '這格是空的', '再按 Shift 回上一層');
      }
      return;
    }
    var idx = rawIdx();
    var it = idx >= 0 ? slots[idx] : null;
    var eff = it ? idx : -1;                           // empty sectors are not selectable
    if (!force && eff === hover) return;
    hover = eff;
    setWheelHover(w1, eff);
    if (it && it.type === 'group') {
      setCenter(w1, it.name, it.description, '往外甩展開：' + it.children.length + ' 個');
    } else if (it) {
      setCenter(w1, it.name, it.description, handoffNote(it.tool));
    } else {
      setCenter(w1, kindLabel(kind), '往工具的方向放開', '在中央放開＝取消');
    }
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

  function hasAnySlot() { return slots.some(Boolean); }

  function viewport() { return { w: window.innerWidth, h: window.innerHeight }; }

  function openWheel() {
    if (wheelOpen || !hasAnySlot()) return;
    wheelOpen = true;
    level = 1; sub = null; noExpandIdx = -1;
    radius = Core.wheelRadius(window.innerWidth, window.innerHeight);
    var c = Core.placeWheel(cursor, viewport(), radius, 8);
    hintEl.hidden = true;
    backdropEl.hidden = false;
    w1.root.hidden = false;
    w1.root.classList.remove('is-behind');
    document.documentElement.classList.add('dw-open');
    renderWheel(w1, slots, c.x, c.y, radius);
    applyHover(true);
  }

  function expandSub(idx) {
    var item = slots[idx];
    var c = Core.placeWheel(cursor, viewport(), radius, 8);   // crossing point, same clamp
    var kids = item.children.slice(0, 8);
    while (kids.length < 8) kids.push(null);
    level = 2;
    sub = { item: item, fromIdx: idx, hover: -2 };
    w1.root.classList.add('is-behind');
    w2.root.hidden = false;
    renderWheel(w2, kids, c.x, c.y, radius);
    applyHover(true);
  }

  function collapseSub() {
    if (level !== 2) return;
    noExpandIdx = sub.fromIdx;
    level = 1; sub = null;
    w2.root.hidden = true;
    w1.root.classList.remove('is-behind');
    hover = -2;
    applyHover(true);
  }

  function closeWheel() {
    wheelOpen = false;
    level = 1; sub = null; hover = -1; noExpandIdx = -1;
    backdropEl.hidden = true;
    w1.root.hidden = true;
    w2.root.hidden = true;
    w1.root.classList.remove('is-behind');
    document.documentElement.classList.remove('dw-open');
  }

  function endDrag() {
    dragging = false;
    depth = 0;
    prevShift = null;
    hintEl.hidden = true;
    closeWheel();
  }

  function onShiftTap() {
    if (!dragging || !ready) return;
    if (!wheelOpen) openWheel();
    else if (level === 2) collapseSub();   // Shift inside the sub-wheel = back to level 1
  }

  function placeHint() {
    var w = hintEl.offsetWidth || 160, h = hintEl.offsetHeight || 28;
    var x = Math.min(Math.max(8, cursor.x + 16), window.innerWidth - w - 8);
    var y = Math.min(Math.max(8, cursor.y + 22), window.innerHeight - h - 8);
    hintEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  /** Level 1 only: a group slot expands when flung past 1.3 x outer radius. */
  function maybeExpand() {
    if (level !== 1) return;
    var dx = cursor.x - w1.cx, dy = cursor.y - w1.cy;
    var idx = Core.slotAt(dx, dy, 0);
    var it = idx >= 0 ? slots[idx] : null;
    var past = !!it && it.type === 'group' && Core.shouldExpand(dx, dy, radius, idx);
    if (!past) { noExpandIdx = -1; return; }
    if (idx === noExpandIdx) return;       // just collapsed here: wait until the pointer comes back in
    expandSub(idx);
  }

  /* ── events ───────────────────────────────────────────── */

  function onDragEnter(e) {
    if (!ready || !hasFiles(e.dataTransfer)) return;
    depth++;
    if (!dragging) {
      dragging = true;
      prevShift = null;
      kind = inferKind(e.dataTransfer);
      slots = API.slots(Core.loadoutKey(kind));
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
      maybeExpand();
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (wheelOpen) applyHover(false); });
    } else if (hasAnySlot()) {
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
    // evaluate the drop position itself, not the last rAF
    var state = { level: level, slots: slots, idx: level === 1 ? rawIdx() : -1 };
    if (level === 2) state.sub = { item: sub.item, idx: rawIdx() };
    var id = Core.resolveDrop(state);
    var tool = id ? toolsById[id] : null;
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
