// Run with: node --test pin-jig/tests
const test = require('node:test');
const assert = require('node:assert');
const geom = require('../js/geom.js');
const trace = require('../js/trace.js');
const meshApi = require('../js/jig-mesh.js');
const layout = require('../js/layout.js');
const model = require('../js/model-import.js');

/** RGBA image with a ring (donut) and a small dot, on a transparent background. */
function donutImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2);
      const ring = d < w * 0.4 && d > w * 0.2;
      const dot = Math.hypot(x + 0.5 - w * 0.95, y + 0.5 - h * 0.05) < 2;
      if (ring || dot) data.set([0, 0, 0, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

/** Every edge of a closed, consistently wound mesh is used once in each direction. */
function assertWatertight(tris) {
  const key = (i) => `${tris[i].toFixed(4)},${tris[i + 1].toFixed(4)},${tris[i + 2].toFixed(4)}`;
  const edges = new Map();
  for (let t = 0; t < tris.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (let k = 0; k < 3; k++) {
      const e = v[k] + '>' + v[(k + 1) % 3];
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  let bad = 0;
  for (const [e, n] of edges) {
    const [a, b] = e.split('>');
    if (n !== 1 || edges.get(b + '>' + a) !== 1) bad++;
  }
  assert.strictEqual(bad, 0, `${bad} non-manifold edges`);
}

function volume(tris) {
  let v = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(i, i + 9);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

test('trace keeps only outer silhouettes', () => {
  const img = donutImage(200, 200);
  const { polys, mode } = trace.traceOutline(img, { mode: 'auto' });
  assert.strictEqual(mode, 'alpha');
  assert.strictEqual(polys.length, 2, 'ring + dot');
  for (const p of polys) assert.ok(geom.signedArea(p) > 0, 'no holes');
  const ring = polys.reduce((a, b) => (geom.signedArea(a) > geom.signedArea(b) ? a : b));
  const r = 200 * 0.4;
  const area = geom.signedArea(ring);
  assert.ok(Math.abs(area - Math.PI * r * r) / (Math.PI * r * r) < 0.02, `filled disc area ${area}`);
});

test('colour mode traces a JPG-style white background', () => {
  const w = 120, h = 80;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 20; y < 60; y++) for (let x = 30; x < 90; x++) data.set([200, 30, 30, 255], (y * w + x) * 4);
  const { polys, mode } = trace.traceOutline({ width: w, height: h, data }, { mode: 'auto' });
  assert.strictEqual(mode, 'color');
  const b = geom.bbox(polys);
  assert.ok(Math.abs(b.w - 60) < 1.1 && Math.abs(b.h - 40) < 1.1, JSON.stringify(b));
});

test('offset grows a 30 mm square by the clearance', () => {
  const sq = [[-15, -15], [15, -15], [15, 15], [-15, 15]];
  const b = geom.bbox(geom.offset([sq], 0.2));
  assert.ok(Math.abs(b.w - 30.4) < 1e-3);
});

test('video layout: 30 mm pins, 5 x 3 at 32 mm fit a 165 x 122 jig', () => {
  const jig = { width: 165, height: 122, thickness: 2.5, depth: 0.5, chamfer: 3, minWall: 1 };
  const circle = Array.from({ length: 96 }, (_, i) => [15 * Math.cos((i / 96) * 2 * Math.PI), 15 * Math.sin((i / 96) * 2 * Math.PI)]);
  const pocket = geom.offset([circle], 0.2);
  const fit = layout.autoFit(jig, { w: 30, h: 30 }, { w: 30.4, h: 30.4 }, 2, jig.minWall);
  assert.deepStrictEqual(fit, { cols: 5, rows: 3, sx: 32, sy: 32 });
  const placed = layout.placePockets(jig, fit, pocket);
  assert.strictEqual(placed.centers.length, 15);
  assert.deepStrictEqual(placed.issues, []);

  const tris = meshApi.buildJigMesh({ ...jig, pockets: placed.pockets });
  assertWatertight(tris);
  const pocketArea = geom.totalArea(placed.pockets);
  const expected = (165 * 122 - 4.5) * 2.5 - pocketArea * 0.5;
  assert.ok(Math.abs(volume(tris) - expected) < 0.05, `volume ${volume(tris)} vs ${expected}`);

  // Round-trip through binary STL.
  const stl = meshApi.toBinarySTL(tris);
  assert.strictEqual(model.parseSTL(stl).length, tris.length);
});

test('pockets that overlap or hit the edge are reported', () => {
  const jig = { width: 165, height: 122, thickness: 2.5, depth: 0.5, chamfer: 0, minWall: 1 };
  const sq = geom.offset([[[-15, -15], [15, -15], [15, 15], [-15, 15]]], 0.2);
  const tight = layout.placePockets(jig, { cols: 5, rows: 3, sx: 30, sy: 32 }, sq);
  assert.ok(tight.issues.some((i) => i.level === 'error' && /overlap/.test(i.text)));
  const wide = layout.placePockets(jig, { cols: 6, rows: 3, sx: 32, sy: 32 }, sq);
  assert.ok(wide.issues.some((i) => /edge/.test(i.text)));
});

test('merged pockets that enclose an island still give a watertight mesh', () => {
  const jig = { width: 165, height: 122, thickness: 2.5, depth: 0.5, chamfer: 3 };
  // A square ring of four bars leaves a solid island in the middle.
  const bar = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const pockets = [bar(40, 30, 120, 40), bar(40, 80, 120, 90), bar(40, 30, 50, 90), bar(110, 30, 120, 90)];
  const tris = meshApi.buildJigMesh({ ...jig, pockets });
  assertWatertight(tris);
});

test('STL footprint is centred and matches the model outline', () => {
  // Extruded 30 x 20 box offset away from the origin.
  const x0 = 100, y0 = 50, x1 = 130, y1 = 70, z = 2;
  const q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
  const P = (x, y, zz) => [x, y, zz];
  const tris = Float32Array.from([
    ...q(P(x0, y0, 0), P(x0, y1, 0), P(x1, y1, 0), P(x1, y0, 0)), // bottom (facing down)
    ...q(P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)), // top
  ]);
  const polys = model.footprint(tris);
  const b = geom.bbox(polys);
  assert.ok(Math.abs(b.w - 30) < 1e-3 && Math.abs(b.h - 20) < 1e-3 && Math.abs(b.cx) < 1e-6 && Math.abs(b.cy) < 1e-6);
});

test('PNG dpi chunk is inserted with a valid CRC', () => {
  // 1x1 PNG
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const out = layout.setPngDpi(png, 300);
  const dv = new DataView(out.buffer);
  assert.strictEqual(String.fromCharCode(...out.subarray(37, 41)), 'pHYs');
  assert.strictEqual(dv.getUint32(41), Math.round(300 / 0.0254));
  assert.strictEqual(dv.getUint32(50), layout.crc32(out.subarray(37, 50)));
  assert.strictEqual(out.length, png.length + 21);
});
