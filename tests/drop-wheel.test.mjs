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
t('paging: 8 slots, nulls pad, 9 tools -> 2 pages', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: i }));
  assert.equal(C.pageCount(9), 2); assert.equal(C.pageCount(8), 1); assert.equal(C.pageCount(0), 1);
  assert.equal(C.pageSlots(nine, 0).filter(Boolean).length, 8);
  const p2 = C.pageSlots(nine, 1);
  assert.equal(p2.length, 8); assert.equal(p2[0].id, 8); assert.equal(p2[1], null);
});
t('toolTakesAny re-filter at drop', () => {
  assert.equal(C.toolTakesAny({ accepts: ['image'] }, ['svg']), false);
  assert.equal(C.toolTakesAny({ accepts: ['image'] }, ['svg', 'image']), true);
  assert.equal(C.toolTakesAny({ accepts: ['image'] }, ['unknown']), true);
  assert.equal(C.toolTakesAny({ accepts: ['other'] }, ['svg']), true);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
