// Run: node tests/drop-wheel.test.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const C = require('../assets/js/drop-wheel-geom.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
const R = 200, INNER = R * 0.5;
const polar = (deg, d) => [Math.sin(deg * Math.PI / 180) * d, -Math.cos(deg * Math.PI / 180) * d]; // 0deg = north, cw

// --- sectorAt ---
const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
names.forEach((n, i) => t('sectorAt ' + n + ' centre direction -> ' + i, () => {
  assert.equal(C.sectorAt(...polar(i * 45, 150), INNER), i);
}));
t('sectorAt dead zone -> -1', () => {
  assert.equal(C.sectorAt(0, 0, INNER), -1);
  assert.equal(C.sectorAt(...polar(90, 99), INNER), -1);
});
t('sectorAt just outside dead zone is selectable', () => {
  assert.equal(C.sectorAt(...polar(90, 101), INNER), 2);
});
t('sectorAt dead-zone edge is inclusive of ring (dist == innerR selects)', () => {
  assert.equal(C.sectorAt(100, 0, INNER), 2);
});
[[0, 5000], [90, 5000], [225, 99999], [315, 1e7]].forEach(([deg, d]) =>
  t('sectorAt far outside ring (' + deg + ' deg, ' + d + 'px) still picks direction', () => {
    assert.equal(C.sectorAt(...polar(deg, d), INNER), Math.round(deg / 45) % 8);
  }));
t('sectorAt boundary +-22.5 deg (N/NE and N/NW)', () => {
  assert.equal(C.sectorAt(...polar(22.4, 150), INNER), 0);
  assert.equal(C.sectorAt(...polar(22.6, 150), INNER), 1);
  assert.equal(C.sectorAt(...polar(-22.4, 150), INNER), 0);
  assert.equal(C.sectorAt(...polar(-22.6, 150), INNER), 7);
});
t('sectorAt all 8 boundaries split correctly (+-0.1 deg)', () => {
  for (let i = 0; i < 8; i++) {
    const b = i * 45 + 22.5;
    assert.equal(C.sectorAt(...polar(b - 0.1, 150), INNER), i);
    assert.equal(C.sectorAt(...polar(b + 0.1, 150), INNER), (i + 1) % 8);
  }
});
t('sectorAt sweeps every degree: exactly 45 per sector', () => {
  const counts = new Array(8).fill(0);
  for (let d = 0; d < 360; d++) counts[C.sectorAt(...polar(d + 0.25, 150), INNER)]++;
  assert.deepEqual(counts, new Array(8).fill(45));
});
t('negative control: a wrong implementation (outer limit) would differ', () => {
  const withOuter = (dx, dy) => (Math.hypot(dx, dy) > R ? -1 : C.sectorAt(dx, dy, INNER));
  assert.equal(withOuter(...polar(90, 5000)), -1);   // the FormatWheel-Windows behaviour
  assert.notEqual(C.sectorAt(...polar(90, 5000), INNER), -1); // ours
});

// --- wheelRadius ---
t('wheelRadius caps at 220 and scales at 36%', () => {
  assert.equal(C.wheelRadius(1920, 1080), 220);
  assert.equal(C.wheelRadius(500, 400), 144);
  assert.equal(C.wheelRadius(300, 1000), 108);
});

// --- placeWheel ---
const VP = { w: 1000, h: 800 }, r = 200, m = 8;
t('placeWheel centre of viewport unchanged', () => {
  assert.deepEqual(C.placeWheel({ x: 500, y: 400 }, VP, r, m), { x: 500, y: 400 });
});
t('placeWheel clamps left/right/top/bottom', () => {
  assert.equal(C.placeWheel({ x: 5, y: 400 }, VP, r, m).x, 208);
  assert.equal(C.placeWheel({ x: 995, y: 400 }, VP, r, m).x, 792);
  assert.equal(C.placeWheel({ x: 500, y: 1 }, VP, r, m).y, 208);
  assert.equal(C.placeWheel({ x: 500, y: 799 }, VP, r, m).y, 592);
});
t('placeWheel corner clamps both axes', () => {
  assert.deepEqual(C.placeWheel({ x: 0, y: 0 }, VP, r, m), { x: 208, y: 208 });
  assert.deepEqual(C.placeWheel({ x: 1e5, y: 1e5 }, VP, r, m), { x: 792, y: 592 });
});
t('placeWheel result ring always inside viewport', () => {
  for (const x of [-50, 0, 100, 500, 999, 1200]) for (const y of [-50, 0, 100, 400, 799, 900]) {
    const c = C.placeWheel({ x, y }, VP, r, m);
    assert.ok(c.x - r >= 0 && c.x + r <= VP.w && c.y - r >= 0 && c.y + r <= VP.h);
  }
});
t('placeWheel viewport smaller than ring -> centred', () => {
  assert.deepEqual(C.placeWheel({ x: 10, y: 10 }, { w: 300, h: 300 }, 200, 8), { x: 150, y: 150 });
});

// --- kinds / filtering / paging ---
t('kindFromType', () => {
  assert.equal(C.kindFromType('image/png'), 'image');
  assert.equal(C.kindFromType('image/svg+xml'), 'svg');
  assert.equal(C.kindFromType('application/json'), 'json-csv');
  assert.equal(C.kindFromType('text/csv'), 'json-csv');
  assert.equal(C.kindFromType('text/html'), 'text-code');
  assert.equal(C.kindFromType('application/zip'), 'other');
  assert.equal(C.kindFromType(''), 'unknown');
});
t('kindFromName', () => {
  assert.equal(C.kindFromName('a.PNG'), 'image');
  assert.equal(C.kindFromName('a.svg'), 'svg');
  assert.equal(C.kindFromName('a.json'), 'json-csv');
  assert.equal(C.kindFromName('a.js'), 'text-code');
  assert.equal(C.kindFromName('a.zip'), 'other');
  assert.equal(C.kindFromName('README'), 'unknown');
});
t('combineKinds', () => {
  assert.equal(C.combineKinds(['image', 'image']), 'image');
  assert.equal(C.combineKinds(['image', 'svg']), 'mixed');
  assert.equal(C.combineKinds([]), 'unknown');
});
const tools = [
  { id: 'a', order: 3, accepts: ['image'] }, { id: 'b', order: 1, accepts: ['svg'] },
  { id: 'c', order: 2 }, { id: 'd', order: 4, accepts: ['other'] }, { id: 'e', order: 0, accepts: [] }
];
t('toolsFor filters, sorts by order, drops tools without accepts, keeps universal', () => {
  assert.deepEqual(C.toolsFor(tools, 'image').map(x => x.id), ['a', 'd']);
  assert.deepEqual(C.toolsFor(tools, 'svg').map(x => x.id), ['b', 'd']);
  assert.deepEqual(C.toolsFor(tools, 'json-csv').map(x => x.id), ['d']);
  assert.deepEqual(C.toolsFor(tools, 'unknown').map(x => x.id), ['b', 'a', 'd']);
});
t('toolTakesAny re-filter at drop', () => {
  assert.equal(C.toolTakesAny({ accepts: ['image'] }, ['svg']), false);
  assert.equal(C.toolTakesAny({ accepts: ['image'] }, ['svg', 'image']), true);
  assert.equal(C.toolTakesAny({ accepts: ['image'] }, ['unknown']), true);
  assert.equal(C.toolTakesAny({ accepts: ['other'] }, ['svg']), true);
});

// --- fan model (numbers shared with FlashGrab: R, 1.0 open, 0.9 close, 36 deg, 5 max, 1.55 band, 1.6 reach) ---
const mk = (id, order, extra = {}) => ({ id, name: id.toUpperCase(), order, accepts: ['image'], ...extra });
const FR = 200;                                   // level-1 outer radius used below
const at = (deg, k) => polar(deg, k * FR);        // pointer at k x R in compass direction deg
const grpItem = (n) => ({ id: 'group:G', type: 'group', name: 'G', children: Array.from({ length: n }, (_, i) => ({ id: 'c' + i })) });
const leafItem = (id) => ({ id, type: 'tool', name: id });
const slotsG = (gslot, n = 5) => { const a = new Array(8).fill(null); a[gslot] = grpItem(n); a[0 === gslot ? 4 : 0] = leafItem('leaf'); return a; };

t('slotAt is the fixed-8 selector (alias of sectorAt)', () => {
  assert.equal(C.slotAt, C.sectorAt);
  assert.equal(C.SECTORS, 8);
});
t('constants are the shared fan numbers', () => {
  assert.deepEqual([C.FAN_MAX, C.FAN_SPAN, C.FAN_OPEN, C.FAN_CLOSE, C.FAN_BAND_OUT, C.FAN_REACH], [5, 36, 1.0, 0.9, 1.55, 1.6]);
});
t('fanLayout: 0, +36, -36, +72, -72 and capped at 5', () => {
  assert.deepEqual(C.fanLayout(5), [0, 36, -36, 72, -72]);
  assert.deepEqual(C.fanLayout(1), [0]);
  assert.deepEqual(C.fanLayout(3), [0, 36, -36]);
  assert.deepEqual(C.fanLayout(7), [0, 36, -36, 72, -72]);
  assert.deepEqual(C.fanLayout(0), []);
});
// fanStep: open / collapse with hysteresis
const closed = { open: false, group: -1 };
t('fanStep: 0.99R on a group slot does NOT open; 1.0R opens', () => {
  const s = slotsG(1);
  assert.equal(C.fanStep(closed, ...at(45, 0.99), FR, s).open, false);
  const o = C.fanStep(closed, ...at(45, 1.0), FR, s);
  assert.deepEqual(o, { open: true, group: 1 });
});
t('fanStep: open stays open at 0.95R (hysteresis), collapses at 0.89R', () => {
  const s = slotsG(1);
  const open = { open: true, group: 1 };
  assert.equal(C.fanStep(open, ...at(45, 0.95), FR, s).open, true);
  assert.equal(C.fanStep(open, ...at(45, 0.9), FR, s).open, true);      // exactly 0.9R: not below
  assert.equal(C.fanStep(open, ...at(45, 0.89), FR, s).open, false);
});
t('fanStep: 0.95R when CLOSED stays closed (the band 0.9-1.0 never opens)', () => {
  assert.equal(C.fanStep(closed, ...at(45, 0.95), FR, slotsG(1)).open, false);
});
t('fanStep: open keeps its group while the pointer wanders to other angles at >=0.9R', () => {
  const r = C.fanStep({ open: true, group: 1 }, ...at(200, 3), FR, slotsG(1));
  assert.deepEqual(r, { open: true, group: 1 });
});
t('fanStep: leaf slot at 5R never opens; empty slot never opens', () => {
  const s = slotsG(1);
  assert.equal(C.fanStep(closed, ...at(0, 5), FR, s).open, false);     // slot 0 is a leaf
  assert.equal(C.fanStep(closed, ...at(270, 5), FR, s).open, false);   // slot 6 empty
  assert.equal(C.slotAt(...at(0, 5), FR * 0.5), 0);                    // and it still selects by direction
});
t('fanStep: centre never opens', () => {
  assert.equal(C.fanStep(closed, 0, 0, FR, slotsG(1)).open, false);
});
// fanHit
t('fanHit: child centres (group at NE=slot 1 -> angles 45, 81, 9, 117, -27)', () => {
  const offs = [0, 36, -36, 72, -72];
  offs.forEach((o, i) => assert.equal(C.fanHit(...at(45 + o, 1.2), FR, 1, 5), i));
});
t('fanHit: wedge boundaries at +-18 and +-54 (half-open, +-0.1 deg either side)', () => {
  assert.equal(C.fanHit(...at(45 + 17.9, 1.2), FR, 1, 5), 0);
  assert.equal(C.fanHit(...at(45 + 18.1, 1.2), FR, 1, 5), 1);
  assert.equal(C.fanHit(...at(45 - 17.9, 1.2), FR, 1, 5), 0);
  assert.equal(C.fanHit(...at(45 - 18.1, 1.2), FR, 1, 5), 2);
  assert.equal(C.fanHit(...at(45 + 53.9, 1.2), FR, 1, 5), 1);
  assert.equal(C.fanHit(...at(45 + 54.1, 1.2), FR, 1, 5), 3);
  assert.equal(C.fanHit(...at(45 - 53.9, 1.2), FR, 1, 5), 2);
  assert.equal(C.fanHit(...at(45 - 54.1, 1.2), FR, 1, 5), 4);
});
t('fanHit: outside the span of present children -> -1 (3 children: +90 and -90 miss; 5 children: +91 misses)', () => {
  assert.equal(C.fanHit(...at(45 + 90, 1.2), FR, 1, 3), -1);
  assert.equal(C.fanHit(...at(45 + 55, 1.2), FR, 1, 3), -1);          // +55 would be child 3 if it existed
  assert.equal(C.fanHit(...at(45 - 90, 1.2), FR, 1, 3), -1);
  assert.equal(C.fanHit(...at(45 + 91, 1.2), FR, 1, 5), -1);
  assert.equal(C.fanHit(...at(45 + 180, 1.2), FR, 1, 5), -1);
});
t('fanHit: no outer limit inside the span (5R and 50R still pick by angle)', () => {
  assert.equal(C.fanHit(...at(45 + 36, 5), FR, 1, 5), 1);
  assert.equal(C.fanHit(...at(45 + 36, 50), FR, 1, 5), 1);
});
t('fanHit: inside R is never a child', () => {
  assert.equal(C.fanHit(...at(45, 0.999), FR, 1, 5), -1);
  assert.equal(C.fanHit(...at(45, 1.0), FR, 1, 5), 0);
});
t('fanHit: angle wrap around north (group N=slot 0, child +36 / -36 across 0/360)', () => {
  assert.equal(C.fanHit(...at(-36, 1.2), FR, 0, 5), 2);
  assert.equal(C.fanHit(...at(324, 1.2), FR, 0, 5), 2);
  assert.equal(C.fanHit(...at(36, 1.2), FR, 0, 5), 1);
  assert.equal(C.fanHit(...at(-72, 1.2), FR, 0, 5), 4);
});
t('fanHit: group at NW=slot 7 wraps (offset +36 = 351 deg)', () => {
  assert.equal(C.fanHit(...at(315 + 36, 1.2), FR, 7, 5), 1);
});

const imgTools = [
  mk('a', 1), mk('b', 2, { group: 'Fam' }), mk('c', 3, { group: 'Fam' }), mk('d', 4, { group: 'Solo' }), mk('e', 5),
  { id: 'svgonly', order: 0, name: 'S', accepts: ['svg'], group: 'Fam' }
];
t('buildLibrary: group forms from >=2 members, 1-member group collapses to leaf', () => {
  const lib = C.buildLibrary(imgTools, 'image');
  assert.deepEqual(lib.map(x => x.id), ['a', 'group:Fam', 'd', 'e']);
  assert.equal(lib[1].type, 'group');
  assert.deepEqual(lib[1].children.map(x => x.id), ['b', 'c']);
  assert.equal(lib[2].type, 'tool'); // Solo collapsed
});
t('buildLibrary: group membership is per kind (svg-only tool does not join image group)', () => {
  assert.deepEqual(C.buildLibrary(imgTools, 'svg').map(x => x.id), ['svgonly']);
});
t('buildLibrary: 7 group members -> only the first 5 (by order) in the fan, extra = 2', () => {
  const seven = Array.from({ length: 7 }, (_, i) => mk('m' + (6 - i), 6 - i, { group: 'Big' }));  // shuffled input order
  const g = C.buildLibrary(seven, 'image')[0];
  assert.deepEqual(g.children.map(x => x.id), ['m0', 'm1', 'm2', 'm3', 'm4']);
  assert.equal(g.extra, 2);
  assert.equal(g.description, '5 個工具');
});
t('groupDefault: flagged tool becomes children[0] (the default), rest keep order', () => {
  const ts = [mk('x', 1, { group: 'Z' }), mk('y', 2, { group: 'Z', groupDefault: true }), mk('w', 3, { group: 'Z' })];
  const g = C.buildLibrary(ts, 'image')[0];
  assert.deepEqual(g.children.map(c => c.id), ['y', 'x', 'w']);
  assert.equal(C.resolveDrop({ slots: [g, null, null, null, null, null, null, null], dx: 0, dy: -FR * 0.8, R: FR, fan: closed }), 'y');
});
t('groupDefault: absent -> falls back to lowest order; a flagged tool beyond 5 still becomes the default', () => {
  const ts = [mk('x', 5, { group: 'Z' }), mk('y', 2, { group: 'Z' })];
  assert.equal(C.buildLibrary(ts, 'image')[0].children[0].id, 'y');
  const six = Array.from({ length: 6 }, (_, i) => mk('k' + i, i, { group: 'Q', groupDefault: i === 5 }));
  const g = C.buildLibrary(six, 'image')[0];
  assert.equal(g.children[0].id, 'k5');
  assert.equal(g.children.length, 5);
});
t('defaultLoadout: <=8 items fill 0..n-1 in order, rest null (angles fixed)', () => {
  const lib = C.buildLibrary(imgTools, 'image');
  assert.deepEqual(C.defaultLoadout(lib), ['a', 'group:Fam', 'd', 'e', null, null, null, null]);
});
const many = Array.from({ length: 11 }, (_, i) => mk('t' + i, i));
t('defaultLoadout: 9+ items -> first 7 plus the auto More group in slot 7 (capped at 5)', () => {
  const lib = C.buildLibrary(many, 'image');
  const d = C.defaultLoadout(lib);
  assert.deepEqual(d.slice(0, 7), ['t0', 't1', 't2', 't3', 't4', 't5', 't6']);
  assert.equal(d[7], C.MORE_ID);
  const slots = C.materializeSlots(d, lib);
  assert.equal(slots[7].name, '更多');
  assert.deepEqual(slots[7].children.map(x => x.id), ['t7', 't8', 't9', 't10']);
});
t('More group is capped at 5 children; the rest lives only in the library', () => {
  const lots = Array.from({ length: 20 }, (_, i) => mk('u' + i, i));
  const lib = C.buildLibrary(lots, 'image');
  const slots = C.materializeSlots(C.defaultLoadout(lib), lib);
  assert.equal(slots[7].children.length, 5);
  assert.equal(slots[7].extra, 8);
  assert.equal(lib.length, 20);
});
t('defaultLoadout: exactly 8 items need no More group', () => {
  const lib = C.buildLibrary(many.slice(0, 8), 'image');
  assert.equal(C.defaultLoadout(lib).includes(C.MORE_ID), false);
});
t('resolveLoadout: stale id dropped to null and reported; others untouched', () => {
  const lib = C.buildLibrary(imgTools, 'image');
  const r = C.resolveLoadout(['a', 'gone', 'd', null, 'e', null, null, null], lib);
  assert.deepEqual(r.slots, ['a', null, 'd', null, 'e', null, null, null]);
  assert.deepEqual(r.dropped, ['gone']);
  assert.equal(r.usedDefault, false);
});
t('resolveLoadout: tool that no longer accepts the kind counts as stale', () => {
  const lib = C.buildLibrary(imgTools, 'svg');
  const r = C.resolveLoadout(['a', 'svgonly', null, null, null, null, null, null], lib);
  assert.deepEqual(r.slots.slice(0, 2), [null, 'svgonly']);
  assert.deepEqual(r.dropped, ['a']);
});
t('resolveLoadout: duplicates and non-strings dropped; explicit empty slots preserved', () => {
  const lib = C.buildLibrary(imgTools, 'image');
  const r = C.resolveLoadout(['a', 'a', 7, null, null, null, null, null], lib);
  assert.deepEqual(r.slots, ['a', null, null, null, null, null, null, null]);
  assert.equal(r.dropped.length, 2);
});
t('resolveLoadout: corrupt shapes fall back to default', () => {
  const lib = C.buildLibrary(imgTools, 'image');
  const def = C.defaultLoadout(lib);
  for (const bad of [null, undefined, {}, 'x', 42, ['a'], new Array(9).fill('a')]) {
    const r = C.resolveLoadout(bad, lib);
    assert.deepEqual(r.slots, def);
    assert.equal(r.usedDefault, true);
  }
});
t('corrupted JSON text: JSON.parse throws, caller default path gives default loadout', () => {
  let parsed; try { parsed = JSON.parse('{not json'); } catch { parsed = undefined; }
  const lib = C.buildLibrary(imgTools, 'image');
  assert.deepEqual(C.resolveLoadout(parsed, lib).slots, C.defaultLoadout(lib));
});
t('resolveLoadout accepts the auto More id', () => {
  const lib = C.buildLibrary(many, 'image');
  assert.equal(C.resolveLoadout([null, null, null, null, null, null, null, C.MORE_ID], lib).slots[7], C.MORE_ID);
});
t('loadoutKey maps mixed/unlisted to unknown', () => {
  assert.equal(C.loadoutKey('image'), 'image');
  assert.equal(C.loadoutKey('mixed'), 'unknown');
  assert.equal(C.loadoutKey('whatever'), 'unknown');
});

// resolveDrop table
const S = slotsG(1, 5);        // slot 1 = group (c0..c4), slot 0 = leaf
const rd = (deg, k, fan) => { const [dx, dy] = at(deg, k); return C.resolveDrop({ slots: S, dx, dy, R: FR, fan }); };
const openFan = { open: true, group: 1 };
t('resolveDrop: leaf slot at 1x and at 5R -> the leaf (direction only, no outer limit)', () => {
  assert.equal(rd(0, 0.8, closed), 'leaf');
  assert.equal(rd(0, 5, closed), 'leaf');
});
t('resolveDrop: fan child hovered -> that child (+36 = child 1, -36 = child 2, far out too)', () => {
  assert.equal(rd(45, 1.2, openFan), 'c0');
  assert.equal(rd(45 + 36, 1.2, openFan), 'c1');
  assert.equal(rd(45 - 36, 1.4, openFan), 'c2');
  assert.equal(rd(45 + 72, 5, openFan), 'c3');
  assert.equal(rd(45 - 72, 5, openFan), 'c4');
});
t('resolveDrop: group slot with fan closed (inside ring) -> default child', () => {
  assert.equal(rd(45, 0.8, closed), 'c0');
});
t('resolveDrop: fan open, pointer in the 0.9-1.0 band -> group slot itself -> default child', () => {
  assert.equal(rd(45, 0.95, openFan), 'c0');
  assert.equal(rd(45 + 60, 0.95, openFan), 'c0');   // band is "the group slot", whatever the angle
});
t('resolveDrop: fan open, outside the span -> cancel; with 3 children the +72 wedge is absent', () => {
  assert.equal(rd(45 + 120, 1.3, openFan), null);
  const S3 = slotsG(1, 3);
  const [dx, dy] = at(45 + 72, 1.3);
  assert.equal(C.resolveDrop({ slots: S3, dx, dy, R: FR, fan: openFan }), null);
});
t('resolveDrop: level-1 dead zone and empty slot cancel', () => {
  assert.equal(rd(45, 0.3, closed), null);
  assert.equal(rd(270, 0.8, closed), null);
  assert.equal(rd(270, 5, closed), null);
});
t('resolveDrop: stale open fan below 0.9R behaves as level 1', () => {
  assert.equal(rd(0, 0.7, openFan), 'leaf');
});

// placement reach
const VP2 = { w: 1280, h: 800 };
t('wheelReach: 1.6R with a group, R without; hasGroup', () => {
  assert.equal(C.wheelReach(200, true), 320);
  assert.equal(C.wheelReach(200, false), 200);
  assert.equal(C.hasGroup([null, leafItem('a')]), false);
  assert.equal(C.hasGroup([null, grpItem(2)]), true);
});
t('placeWheel with group reach keeps the whole band inside the viewport; without it the old clamp', () => {
  const R0 = 220;
  const withG = C.placeWheel({ x: 5, y: 5 }, VP2, C.wheelReach(R0, true), 8);
  assert.deepEqual(withG, { x: 360, y: 360 });
  assert.ok(withG.x - 1.6 * R0 >= 0 && withG.y - 1.6 * R0 >= 0);
  const noG = C.placeWheel({ x: 5, y: 5 }, VP2, C.wheelReach(R0, false), 8);
  assert.deepEqual(noG, { x: 228, y: 228 });
  const br = C.placeWheel({ x: 1e5, y: 1e5 }, VP2, C.wheelReach(R0, true), 8);
  assert.ok(br.x + 1.6 * R0 <= 1280 && br.y + 1.6 * R0 <= 800);
});
t('radiusFor: with a group the ring shrinks so a 1.6R band fits the short side; without, unchanged', () => {
  assert.equal(C.radiusFor(1280, 800, false), 220);
  assert.equal(C.radiusFor(1280, 800, true), 220);                    // (800-16)/3.2 = 245
  assert.ok(Math.abs(C.radiusFor(1000, 600, true) - 182.5) < 1e-9);   // (600-16)/3.2
  const r = C.radiusFor(375, 740, true);
  assert.ok(2 * 1.6 * r + 16 <= 375 + 1e-9);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
