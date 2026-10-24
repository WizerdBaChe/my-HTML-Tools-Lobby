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

  /* ── level 2 / loadout model ─────────────────────────────
   * Library item shapes (plain objects, JSON-safe):
   *   { id: <tool id>,           type: 'tool',  name, description, tool }
   *   { id: 'group:<label>',     type: 'group', name, description, children: [toolItem...] }
   * Slot arrays always have exactly 8 entries (item | null). Angles never
   * move when items change: an unassigned slot is just null.
   */
  var EXPAND_FACTOR = 1.3;
  var MORE_ID = 'group:more';
  var MORE_NAME = '更多';
  var LOADOUT_KINDS = ['image', 'svg', 'json-csv', 'text-code', 'other', 'unknown'];

  /** A group slot expands when the pointer is >= 1.3 x outer radius out, still in that slot's direction. */
  function shouldExpand(dx, dy, outerR, slotIndex) {
    if (Math.sqrt(dx * dx + dy * dy) < EXPAND_FACTOR * outerR) return false;
    return sectorAt(dx, dy, 0) === slotIndex;
  }

  /** Loadout key of a kind ('mixed' and anything unlisted share 'unknown'). */
  function loadoutKey(kind) { return LOADOUT_KINDS.indexOf(kind) >= 0 ? kind : 'unknown'; }

  function toolItem(t) {
    return { id: t.id, type: 'tool', name: t.name, description: t.description || '', tool: t };
  }

  /**
   * Every wheel item available for a kind: accepting tools (leaves) plus groups.
   * Tools sharing `group` form a group for this kind; a 1-member group is a leaf.
   * Ordered by tools.json `order` (a group sits at its first member's position).
   * The auto 'more' group is NOT in the library; it is derived from the loadout.
   */
  function buildLibrary(tools, kind) {
    var list = toolsFor(tools, kind);
    var byGroup = {}, items = [], seen = {};
    list.forEach(function (t) {
      if (typeof t.group === 'string' && t.group) (byGroup[t.group] = byGroup[t.group] || []).push(t);
    });
    list.forEach(function (t) {
      var g = typeof t.group === 'string' && t.group ? byGroup[t.group] : null;
      if (g && g.length > 1) {
        if (seen[t.group]) return;
        seen[t.group] = true;
        items.push({
          id: 'group:' + t.group, type: 'group', name: t.group,
          description: g.length + ' 個工具', children: g.slice(0, 8).map(toolItem)
        });
      } else {
        items.push(toolItem(t));
      }
    });
    return items;
  }

  function flattenTools(items) {
    var out = [];
    items.forEach(function (it) {
      if (it.type === 'group') it.children.forEach(function (c) { out.push(c); }); else out.push(it);
    });
    return out;
  }

  /**
   * Default slot ids: fill 0..7 in order. More than 8 items: slots 0..6 take the
   * first seven and slot 7 is the auto group 'more' (holds the rest, up to 8).
   */
  function defaultLoadout(items) {
    var ids = [];
    for (var i = 0; i < SECTORS; i++) ids.push(null);
    if (items.length <= SECTORS) {
      items.forEach(function (it, i) { ids[i] = it.id; });
    } else {
      for (var j = 0; j < SECTORS - 1; j++) ids[j] = items[j].id;
      ids[SECTORS - 1] = MORE_ID;
    }
    return ids;
  }

  /**
   * Validate a stored loadout (array of 8 ids|null) against the library.
   * Unknown / stale / duplicate ids become null and are listed in `dropped`.
   * Anything that is not a plain array of length 8 falls back to the default.
   * Returns { slots: [8 ids|null], dropped: [ids], usedDefault: bool }.
   */
  function resolveLoadout(stored, items) {
    if (!Array.isArray(stored) || stored.length !== SECTORS) {
      return { slots: defaultLoadout(items), dropped: [], usedDefault: true };
    }
    var valid = {};
    items.forEach(function (it) { valid[it.id] = true; });
    valid[MORE_ID] = true;
    var used = {}, slots = [], dropped = [];
    stored.forEach(function (id) {
      if (id == null) { slots.push(null); return; }
      if (typeof id !== 'string' || !valid[id] || used[id]) { dropped.push(id); slots.push(null); return; }
      used[id] = true; slots.push(id);
    });
    return { slots: slots, dropped: dropped, usedDefault: false };
  }

  /** Slot ids -> slot items (8 entries). 'more' = every library item not placed elsewhere, flattened, max 8. */
  function materializeSlots(slotIds, items) {
    var byId = {}, placed = {};
    items.forEach(function (it) { byId[it.id] = it; });
    slotIds.forEach(function (id) { if (id && id !== MORE_ID) placed[id] = true; });
    return slotIds.map(function (id) {
      if (!id) return null;
      if (id === MORE_ID) {
        var rest = flattenTools(items.filter(function (it) { return !placed[it.id]; })).slice(0, SECTORS);
        if (!rest.length) return null;
        return { id: MORE_ID, type: 'group', name: MORE_NAME, description: rest.length + ' 個工具', children: rest };
      }
      return byId[id] || null;
    });
  }

  /**
   * Which tool id does a drop open? null = cancel.
   * state: { level: 1|2, slots: [8 items|null], idx: raw level-1 sector (-1 dead zone),
   *          sub: { item, idx } (level 2; idx = raw sub sector, -1 dead zone) }
   */
  function resolveDrop(state) {
    if (state.level === 2 && state.sub) {
      var kids = state.sub.item.children;
      if (state.sub.idx < 0) return kids[0] ? kids[0].id : null;   // sub dead zone = default child
      var k = kids[state.sub.idx];
      return k ? k.id : null;                                        // empty sub slot = cancel
    }
    if (state.idx < 0) return null;                                  // level-1 dead zone = cancel
    var it = state.slots[state.idx];
    if (!it) return null;                                            // empty slot = cancel
    if (it.type === 'group') return it.children[0] ? it.children[0].id : null; // unexpanded group = default child
    return it.id;
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
    sectorAt: sectorAt, slotAt: sectorAt, shouldExpand: shouldExpand, wheelRadius: wheelRadius, placeWheel: placeWheel,
    kindFromType: kindFromType, kindFromName: kindFromName, combineKinds: combineKinds,
    toolsFor: toolsFor, toolTakesAny: toolTakesAny,
    EXPAND_FACTOR: EXPAND_FACTOR, MORE_ID: MORE_ID, LOADOUT_KINDS: LOADOUT_KINDS,
    loadoutKey: loadoutKey, buildLibrary: buildLibrary, defaultLoadout: defaultLoadout,
    resolveLoadout: resolveLoadout, materializeSlots: materializeSlots, resolveDrop: resolveDrop
  };
});
