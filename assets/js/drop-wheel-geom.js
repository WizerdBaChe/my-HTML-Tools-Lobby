/*
 * drop-wheel-geom.js — pure functions for the lobby drop wheel.
 * No DOM access: loadable in the browser (window.DropWheelCore) and in plain
 * node (module.exports) so tests/drop-wheel.test.mjs can exercise it.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DropWheelCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SECTORS = 8;
  var KINDS = ['image', 'svg', 'json-csv', 'text-code', 'other'];

  /**
   * Which sector does the offset (dx, dy) from the wheel centre point at?
   * Sector 0 = N, then clockwise every 45 degrees (1 = NE ... 7 = NW).
   * Direction only: there is deliberately NO outer radius. Returns -1 only
   * inside the dead zone (distance < innerR) or at the exact centre.
   */
  function sectorAt(dx, dy, innerR) {
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0 || dist < innerR) return -1;
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI; // 0 = north, clockwise positive
    var shifted = (deg + 22.5 + 360) % 360;        // sector 0 spans [-22.5, 22.5)
    return Math.floor(shifted / 45) % SECTORS;
  }

  /** Ring radius: min(220px, 36% of the short viewport side). */
  function wheelRadius(vw, vh) {
    return Math.min(220, 0.36 * Math.min(vw, vh));
  }

  /**
   * Centre of the wheel: the cursor, clamped so the full ring (radius r plus
   * margin) stays inside the viewport. A viewport too small for the ring is
   * centred on that axis.
   */
  function placeWheel(cursor, viewport, r, margin) {
    var m = margin == null ? 8 : margin;
    function clamp(v, size) {
      var lo = r + m, hi = size - r - m;
      if (lo > hi) return size / 2;
      return Math.min(hi, Math.max(lo, v));
    }
    return { x: clamp(cursor.x, viewport.w), y: clamp(cursor.y, viewport.h) };
  }

  /** MIME type (as seen during drag) -> kind, or 'unknown' when unreadable. */
  function kindFromType(type) {
    var t = String(type || '').toLowerCase();
    if (!t) return 'unknown';
    if (t === 'image/svg+xml') return 'svg';
    if (t.indexOf('image/') === 0) return 'image';
    if (t === 'application/json' || t === 'text/csv' || t === 'text/tab-separated-values' ||
        t === 'application/x-ndjson' || t === 'application/vnd.ms-excel') return 'json-csv';
    if (t.indexOf('text/') === 0 || t === 'application/javascript' || t === 'application/xml' ||
        t === 'application/x-httpd-php') return 'text-code';
    return 'other';
  }

  /** File name -> kind (used at drop, when names become readable). */
  function kindFromName(name) {
    var m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'svg') return 'svg';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico'].indexOf(ext) >= 0) return 'image';
    if (['json', 'csv', 'tsv', 'ndjson'].indexOf(ext) >= 0) return 'json-csv';
    if (['txt', 'md', 'html', 'htm', 'css', 'js', 'mjs', 'ts', 'xml', 'yml', 'yaml', 'py', 'log'].indexOf(ext) >= 0) return 'text-code';
    return ext ? 'other' : 'unknown';
  }

  /** Several files: a single shared kind, else 'mixed' (treated like unknown). */
  function combineKinds(kinds) {
    if (!kinds.length) return 'unknown';
    var first = kinds[0];
    for (var i = 1; i < kinds.length; i++) if (kinds[i] !== first) return 'mixed';
    return first;
  }

  /**
   * Tools shown on the wheel for a kind. Tools without `accepts` never appear.
   * A tool accepting 'other' is universal. unknown/mixed shows every tool that
   * declares accepts. Result keeps tools.json `order`.
   */
  function toolsFor(tools, kind) {
    var out = [];
    for (var i = 0; i < tools.length; i++) {
      var a = tools[i] && tools[i].accepts;
      if (!Array.isArray(a) || !a.length) continue;
      if (kind === 'unknown' || kind === 'mixed' || a.indexOf(kind) >= 0 || a.indexOf('other') >= 0) out.push(tools[i]);
    }
    return out.sort(function (x, y) { return (x.order || 0) - (y.order || 0); });
  }

  function pageCount(n) { return Math.max(1, Math.ceil(n / SECTORS)); }

  /** Exactly 8 slots for a page; missing slots are null (drawn empty). */
  function pageSlots(list, page) {
    var slots = [];
    for (var i = 0; i < SECTORS; i++) slots.push(list[page * SECTORS + i] || null);
    return slots;
  }

  /** Does the tool take at least one of the given kinds (post-drop re-filter)? */
  function toolTakesAny(tool, kinds) {
    var a = tool.accepts || [];
    if (a.indexOf('other') >= 0) return true;
    for (var i = 0; i < kinds.length; i++) {
      if (kinds[i] === 'unknown' || a.indexOf(kinds[i]) >= 0) return true;
    }
    return false;
  }

  return {
    SECTORS: SECTORS, KINDS: KINDS,
    sectorAt: sectorAt, wheelRadius: wheelRadius, placeWheel: placeWheel,
    kindFromType: kindFromType, kindFromName: kindFromName, combineKinds: combineKinds,
    toolsFor: toolsFor, pageCount: pageCount, pageSlots: pageSlots, toolTakesAny: toolTakesAny
  };
});
