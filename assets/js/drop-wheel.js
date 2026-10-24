/*
 * drop-wheel.js — lobby LAUNCHER feature (not tool logic).
 * While a file is dragged over the lobby, tapping Shift opens a radial picker
 * of the tools that accept that kind of file; dropping on a sector opens the
 * tool (new tab, so window.opener exists) and hands the files over by
 * postMessage. Without a file drag nothing in this file does anything.
 *
 * Model: level 1 = 8 FIXED slots (N, NE, ... NW; index 0 = N, clockwise) filled
 * from a per-file-kind loadout (localStorage, editable in drop-wheel-config.js).
 * A slot may hold a group (max 5 children): pulling out past the ring (1.0 R)
 * in its direction fans the children out as an arc band on the same centre;
 * pulling back below 0.9 R collapses it. Selection is direction-only.
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
  var fan = { open: false, group: -1 };   // fan band state (hysteresis), see Core.fanStep
  var fanEls = [];         // { path, label } of the open fan band
  var lastKey = '';        // last applied hover descriptor (skip redundant DOM writes)
  var prevShift = null;    // null until first dragover of a drag (no edge on the first sample)
  var cursor = { x: 0, y: 0 };
  var radius = 220;
  var hover = -1;
  var hintEl, backdropEl, toastEl, w1;

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

  /** The wheel: SVG ring + labels + centre text. */
  function makeWheel(extraCls) {
    var w = { r: 220, cx: 0, cy: 0, sectors: [], labels: [], chevrons: [] };
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
    w.sectors = []; w.labels = []; w.chevrons = [];
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
        w.chevrons[i] = c;
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

  /** Pointer offset from the wheel centre (state, not layout: no DOM read per event). */
  function offsets() { return { dx: cursor.x - w1.cx, dy: cursor.y - w1.cy }; }

  function ringPath(r, r0, r1, a0, a1) {
    var p0 = polarPoint(r, a0, r1), p1 = polarPoint(r, a1, r1);
    var p2 = polarPoint(r, a1, r0), p3 = polarPoint(r, a0, r0);
    return 'M' + p0.x + ' ' + p0.y + ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + p1.x + ' ' + p1.y +
           ' L' + p2.x + ' ' + p2.y + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + p3.x + ' ' + p3.y + ' Z';
  }

  /** Draw the fan band of the open group: children on the same centre, beyond the ring. */
  function renderFan(groupIdx) {
    var R = w1.r, item = slots[groupIdx];
    var lay = Core.fanLayout(item.children.length);
    var gap = 1.5, cw = Math.max(64, R * 0.5);
    lay.forEach(function (off, i) {
      var ang = groupIdx * 45 + off, half = Core.FAN_SPAN / 2;
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', ringPath(R, R + 6, R * Core.FAN_BAND_OUT, ang - half + gap, ang + half - gap));
      p.setAttribute('class', 'dw-fan-sector');
      w1.svg.appendChild(p);
      var lab = el('div', 'dw-label dw-fan-label', w1.root);
      var pt = polarPoint(R, ang, R * 1.28);
      lab.style.left = pt.x + 'px'; lab.style.top = pt.y + 'px'; lab.style.width = cw + 'px';
      lab.textContent = item.children[i].name;
      fanEls.push({ path: p, label: lab });
    });
  }

  function clearFan() {
    fanEls.forEach(function (f) { f.path.remove(); f.label.remove(); });
    fanEls = [];
  }

  function applyHover(force) {
    var o = offsets(), R = w1.r;
    var dist = Math.sqrt(o.dx * o.dx + o.dy * o.dy);
    var slotHover = -1, child = -1, mode = 'slot';
    if (fan.open) {
      if (dist < R - 1e-9) { mode = 'band'; slotHover = fan.group; }          // 0.9R-1.0R: the group slot itself
      else {
        child = Core.fanHit(o.dx, o.dy, R, fan.group, slots[fan.group].children.length);
        mode = child >= 0 ? 'child' : 'outside';
      }
    } else {
      var idx = Core.slotAt(o.dx, o.dy, R * 0.5);
      slotHover = idx >= 0 && slots[idx] ? idx : -1;                           // empty sectors are not selectable
    }
    var key = [fan.open ? fan.group : -1, slotHover, child, mode].join(':');
    if (!force && key === lastKey) return;
    lastKey = key;
    w1.sectors.forEach(function (s, i) {
      s.classList.toggle('is-hover', i === slotHover);
      s.classList.toggle('is-open', fan.open && i === fan.group);
    });
    w1.labels.forEach(function (l, i) { l.classList.toggle('is-hover', i === slotHover); });
    w1.chevrons.forEach(function (c, i) {
      if (!c) return;
      c.classList.toggle('is-hover', i === slotHover);
      c.classList.toggle('is-open', fan.open && i === fan.group && i !== slotHover);
    });
    fanEls.forEach(function (f, i) {
      f.path.classList.toggle('is-hover', i === child);
      f.label.classList.toggle('is-hover', i === child);
    });
    if (fan.open) {
      var g = slots[fan.group];
      if (mode === 'child') {
        var c = g.children[child];
        setCenter(w1, c.name, c.description, handoffNote(c.tool));
      } else if (mode === 'band') {
        setCenter(w1, g.name, '放開＝開啟預設：' + (g.children[0] ? g.children[0].name : ''), '拉回收合');
      } else {
        setCenter(w1, g.name, '這裡放開＝取消', '拉回收合');
      }
      return;
    }
    var it = slotHover >= 0 ? slots[slotHover] : null;
    if (it && it.type === 'group') setCenter(w1, it.name, it.description, '往外甩展開：' + it.children.length + ' 個');
    else if (it) setCenter(w1, it.name, it.description, handoffNote(it.tool));
    else setCenter(w1, kindLabel(kind), '往工具的方向放開', '在中央放開＝取消');
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
    fan = { open: false, group: -1 }; lastKey = '';
    // With a group on the wheel keep the whole band (1.6 R) inside the viewport.
    var withGroup = Core.hasGroup(slots);
    radius = Core.radiusFor(window.innerWidth, window.innerHeight, withGroup, 8);
    var c = Core.placeWheel(cursor, viewport(), Core.wheelReach(radius, withGroup), 8);
    hintEl.hidden = true;
    backdropEl.hidden = false;
    w1.root.hidden = false;
    document.documentElement.classList.add('dw-open');
    renderWheel(w1, slots, c.x, c.y, radius);
    applyHover(true);
  }

  function closeWheel() {
    wheelOpen = false;
    clearFan();
    fan = { open: false, group: -1 }; lastKey = '';
    backdropEl.hidden = true;
    w1.root.hidden = true;
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
    if (!wheelOpen) openWheel();          // once open, Shift does nothing: pulling back is the way out
  }

  function placeHint() {
    var w = hintEl.offsetWidth || 160, h = hintEl.offsetHeight || 28;
    var x = Math.min(Math.max(8, cursor.x + 16), window.innerWidth - w - 8);
    var y = Math.min(Math.max(8, cursor.y + 22), window.innerHeight - h - 8);
    hintEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  /** Hysteresis: open at >= 1.0 R in a group slot, collapse below 0.9 R. Returns true if the fan changed. */
  function stepFan() {
    var o = offsets();
    var next = Core.fanStep(fan, o.dx, o.dy, w1.r, slots);
    if (next.open === fan.open && next.group === fan.group) return false;
    fan = next;
    clearFan();
    if (fan.open) renderFan(fan.group);
    return true;
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
      stepFan();
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
    stepFan();
    var o = offsets();
    var id = Core.resolveDrop({ slots: slots, dx: o.dx, dy: o.dy, R: w1.r, fan: fan });
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
