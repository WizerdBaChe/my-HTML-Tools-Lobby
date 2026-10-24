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

// --- level 2 / loadout model ---
const mk = (id, order, extra = {}) => ({ id, name: id.toUpperCase(), order, accepts: ['image'], ...extra });
t('slotAt is the fixed-8 selector (alias of sectorAt)', () => {
  assert.equal(C.slotAt, C.sectorAt);
  assert.equal(C.SECTORS, 8);
});
t('shouldExpand: group slot at 1.29x does NOT expand, 1.31x does', () => {
  assert.equal(C.shouldExpand(...polar(90, 1.29 * R), R, 2), false);
  assert.equal(C.shouldExpand(...polar(90, 1.31 * R), R, 2), true);
});
t('shouldExpand: only in the slot\'s own direction', () => {
  assert.equal(C.shouldExpand(...polar(0, 2 * R), R, 2), false);
  assert.equal(C.shouldExpand(...polar(44, 2 * R), R, 1), true);
  assert.equal(C.shouldExpand(...polar(44, 2 * R), R, 2), false);
});
t('leaf slot at 5x radius: no expansion concept applies, direction still selects', () => {
  // expansion is only asked for group slots; the leaf path is plain slotAt
  assert.equal(C.slotAt(...polar(180, 5 * R), INNER), 4);
});
t('shouldExpand never fires at the exact centre', () => {
  assert.equal(C.shouldExpand(0, 0, R, 0), false);
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
t('defaultLoadout: <=8 items fill 0..n-1 in order, rest null (angles fixed)', () => {
  const lib = C.buildLibrary(imgTools, 'image');
  assert.deepEqual(C.defaultLoadout(lib), ['a', 'group:Fam', 'd', 'e', null, null, null, null]);
});
const many = Array.from({ length: 11 }, (_, i) => mk('t' + i, i));
t('defaultLoadout: 9+ items -> first 7 plus the auto More group in slot 7', () => {
  const lib = C.buildLibrary(many, 'image');
  const d = C.defaultLoadout(lib);
  assert.deepEqual(d.slice(0, 7), ['t0', 't1', 't2', 't3', 't4', 't5', 't6']);
  assert.equal(d[7], C.MORE_ID);
  const slots = C.materializeSlots(d, lib);
  assert.equal(slots[7].name, '更多');
  assert.deepEqual(slots[7].children.map(x => x.id), ['t7', 't8', 't9', 't10']);
});
t('defaultLoadout: exactly 8 items need no More group', () => {
  const lib = C.buildLibrary(many.slice(0, 8), 'image');
  assert.equal(C.defaultLoadout(lib).includes(C.MORE_ID), false);
});
t('More group holds at most 8 children; the rest lives only in the library', () => {
  const lots = Array.from({ length: 20 }, (_, i) => mk('u' + i, i));
  const lib = C.buildLibrary(lots, 'image');
  const slots = C.materializeSlots(C.defaultLoadout(lib), lib);
  assert.equal(slots[7].children.length, 8);
  assert.equal(lib.length, 20);
});
t('resolveLoadout: stale id dropped to null and reported; others untouched', () => {
  const lib = C.buildLibrary(imgTools, 'image');
  const r = C.resolveLoadout(['a', 'gone', 'd', null, 'e', null, null, null], lib);
  assert.deepEqual(r.slots, ['a', null, 'd', null, 'e', null, null, null]);
  assert.deepEqual(r.dropped, ['gone']);
  assert.equal(r.usedDefault, false);
});
t('resolveLoadout: tool that no longer accepts the kind counts as stale', () => {
  const lib = C.buildLibrary(imgTools, 'svg');           // only svgonly available
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
t('resolveLoadout: corrupt shapes (null, object, string, wrong length) fall back to default', () => {
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

const lib2 = C.buildLibrary(imgTools, 'image');
const slots2 = C.materializeSlots(C.defaultLoadout(lib2), lib2);   // a, Fam(b,c), d, e
t('resolveDrop level 1: leaf slot -> its id', () => {
  assert.equal(C.resolveDrop({ level: 1, slots: slots2, idx: 0 }), 'a');
});
t('resolveDrop level 1: unexpanded group -> default child (children[0])', () => {
  assert.equal(C.resolveDrop({ level: 1, slots: slots2, idx: 1 }), 'b');
});
t('resolveDrop level 1: dead zone and empty slot -> cancel', () => {
  assert.equal(C.resolveDrop({ level: 1, slots: slots2, idx: -1 }), null);
  assert.equal(C.resolveDrop({ level: 1, slots: slots2, idx: 6 }), null);
});
t('resolveDrop level 2: sub slot -> child; sub dead zone -> default child; empty sub slot -> cancel', () => {
  const sub = (idx) => ({ level: 2, slots: slots2, idx: 1, sub: { item: slots2[1], idx } });
  assert.equal(C.resolveDrop(sub(1)), 'c');
  assert.equal(C.resolveDrop(sub(0)), 'b');
  assert.equal(C.resolveDrop(sub(-1)), 'b');
  assert.equal(C.resolveDrop(sub(5)), null);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
