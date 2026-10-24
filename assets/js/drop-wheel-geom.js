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

  /* ── fan / loadout model ──────────────────────────────────
   * Library item shapes (plain objects, JSON-safe):
   *   { id: <tool id>,           type: 'tool',  name, description, tool }
   *   { id: 'group:<label>',     type: 'group', name, description, children: [toolItem...], extra }
   * Slot arrays always have exactly 8 entries (item | null). Angles never
   * move when items change: an unassigned slot is just null.
   * A group's children (max FAN_MAX) fan out as an arc band beyond the group
   * slot on the SAME centre as level 1. Numbers are shared with FlashGrab: keep.
   */
  var FAN_MAX = 5;          // children shown per group
  var FAN_SPAN = 36;        // degrees per child wedge
  var FAN_OPEN = 1.0;       // open at distance >= 1.0 R in a group slot
  var FAN_CLOSE = 0.9;      // collapse below 0.9 R (hysteresis)
  var FAN_BAND_OUT = 1.55;  // band outer edge, x R
  var FAN_REACH = 1.6;      // placement reach when a group is on the wheel, x R
  var EPS = 1e-9;           // boundary tolerance: a pointer exactly on 1.0 R / 0.9 R counts as on it
  var MORE_ID = 'group:more';
  var MORE_NAME = '更多';
  var LOADOUT_KINDS = ['image', 'svg', 'json-csv', 'text-code', 'other', 'unknown'];

  /** Angle offsets (degrees from the group slot's angle) of the first n children: 0, +36, -36, +72, -72. */
  function fanLayout(n) {
    var all = [0, FAN_SPAN, -FAN_SPAN, 2 * FAN_SPAN, -2 * FAN_SPAN];
    return all.slice(0, Math.max(0, Math.min(n, FAN_MAX)));
  }

  /**
   * Fan hit test: distance >= R -> the child whose 36-degree wedge contains the
   * pointer angle (offset from the group slot's angle, wrapped to [-180,180)).
   * Wedges are half-open [o-18, o+18). Outside the span of the present children,
   * or inside R: -1. No outer limit.
   */
  function fanHit(dx, dy, R, groupSlot, n) {
    if (Math.sqrt(dx * dx + dy * dy) < R - EPS) return -1;
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    var off = ((deg - groupSlot * 45) % 360 + 540) % 360 - 180;   // [-180, 180)
    var lay = fanLayout(n), half = FAN_SPAN / 2;
    for (var i = 0; i < lay.length; i++) {
      if (off >= lay[i] - half && off < lay[i] + half) return i;
    }
    return -1;
  }

  /**
   * Hysteresis state machine. state = { open: bool, group: slot|-1 }.
   * Closed: opens when the pointer's slot holds a group and distance >= 1.0 R.
   * Open: stays open until distance < 0.9 R.
   */
  function fanStep(state, dx, dy, R, slots) {
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (state && state.open) {
      if (dist < FAN_CLOSE * R - EPS) return { open: false, group: -1 };
      return { open: true, group: state.group };
    }
    if (dist >= FAN_OPEN * R - EPS) {
      var idx = sectorAt(dx, dy, 0);
      var it = idx >= 0 ? slots[idx] : null;
      if (it && it.type === 'group') return { open: true, group: idx };
    }
    return { open: false, group: -1 };
  }

  function hasGroup(slots) {
    return slots.some(function (s) { return !!s && s.type === 'group'; });
  }

  /** Ring radius for a wheel; with a group on it, shrink so the 1.6 R band fits the short side. */
  function radiusFor(vw, vh, withGroup, margin) {
    var r = wheelRadius(vw, vh);
    if (!withGroup) return r;
    var m = margin == null ? 8 : margin;
    return Math.min(r, (Math.min(vw, vh) - 2 * m) / (2 * FAN_REACH));
  }

  /** Reach used by placeWheel: the band's extent when a group is present, else the ring. */
  function wheelReach(R, withGroup) { return withGroup ? FAN_REACH * R : R; }

  /** Loadout key of a kind ('mixed' and anything unlisted share 'unknown'). */
  function loadoutKey(kind) { return LOADOUT_KINDS.indexOf(kind) >= 0 ? kind : 'unknown'; }

  function toolItem(t) {
    return { id: t.id, type: 'tool', name: t.name, description: t.description || '', tool: t };
  }

  /**
   * Every wheel item available for a kind: accepting tools (leaves) plus groups.
   * Tools sharing `group` form a group for this kind; a 1-member group is a leaf.
   * Ordered by tools.json `order` (a group sits at its first member's position).
   * Group children: the tool flagged `groupDefault: true` first (the default),
   * then the rest by order; only the first FAN_MAX are kept (`extra` counts the rest).
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
        var def = g.filter(function (x) { return x.groupDefault === true; })[0];
        var ordered = def ? [def].concat(g.filter(function (x) { return x !== def; })) : g;
        items.push({
          id: 'group:' + t.group, type: 'group', name: t.group,
          description: Math.min(ordered.length, FAN_MAX) + ' 個工具',
          children: ordered.slice(0, FAN_MAX).map(toolItem),
          extra: Math.max(0, ordered.length - FAN_MAX)
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
   * first seven and slot 7 is the auto group 'more' (holds the rest, up to 5).
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

  /** Slot ids -> slot items (8 entries). 'more' = every library item not placed elsewhere, flattened, max FAN_MAX. */
  function materializeSlots(slotIds, items) {
    var byId = {}, placed = {};
    items.forEach(function (it) { byId[it.id] = it; });
    slotIds.forEach(function (id) { if (id && id !== MORE_ID) placed[id] = true; });
    return slotIds.map(function (id) {
      if (!id) return null;
      if (id === MORE_ID) {
        var all = flattenTools(items.filter(function (it) { return !placed[it.id]; }));
        var rest = all.slice(0, FAN_MAX);
        if (!rest.length) return null;
        return { id: MORE_ID, type: 'group', name: MORE_NAME, description: rest.length + ' 個工具', children: rest, extra: all.length - rest.length };
      }
      return byId[id] || null;
    });
  }

  /**
   * Which tool id does a drop open? null = cancel.
   * state: { slots: [8 items|null], dx, dy (pointer offset from the wheel centre),
   *          R (level-1 outer radius), fan: { open, group } }
   *  - fan open and distance >= R: the fan child under the pointer, else cancel (outside the span)
   *  - fan open and 0.9 R <= distance < R: the group slot itself -> default child
   *  - otherwise level 1: dead zone / empty slot cancel, leaf -> itself, group -> default child
   */
  function resolveDrop(state) {
    var dist = Math.sqrt(state.dx * state.dx + state.dy * state.dy);
    var fan = state.fan;
    if (fan && fan.open && dist >= FAN_CLOSE * state.R - EPS) {
      var g = state.slots[fan.group];
      if (g && g.type === 'group') {
        if (dist >= state.R - EPS) {
          var ci = fanHit(state.dx, state.dy, state.R, fan.group, g.children.length);
          return ci >= 0 ? g.children[ci].id : null;
        }
        return g.children[0] ? g.children[0].id : null;
      }
    }
    var idx = sectorAt(state.dx, state.dy, state.R * 0.5);
    if (idx < 0) return null;                                   // level-1 dead zone = cancel
    var it = state.slots[idx];
    if (!it) return null;                                       // empty slot = cancel
    if (it.type === 'group') return it.children[0] ? it.children[0].id : null;  // group slot (closed fan) = default child
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
    sectorAt: sectorAt, slotAt: sectorAt, wheelRadius: wheelRadius, placeWheel: placeWheel,
    kindFromType: kindFromType, kindFromName: kindFromName, combineKinds: combineKinds,
    toolsFor: toolsFor, toolTakesAny: toolTakesAny,
    FAN_MAX: FAN_MAX, FAN_SPAN: FAN_SPAN, FAN_OPEN: FAN_OPEN, FAN_CLOSE: FAN_CLOSE, FAN_BAND_OUT: FAN_BAND_OUT, FAN_REACH: FAN_REACH,
    fanLayout: fanLayout, fanHit: fanHit, fanStep: fanStep, hasGroup: hasGroup, radiusFor: radiusFor, wheelReach: wheelReach, MORE_ID: MORE_ID, LOADOUT_KINDS: LOADOUT_KINDS,
    loadoutKey: loadoutKey, buildLibrary: buildLibrary, defaultLoadout: defaultLoadout,
    resolveLoadout: resolveLoadout, materializeSlots: materializeSlots, resolveDrop: resolveDrop
  };
});
