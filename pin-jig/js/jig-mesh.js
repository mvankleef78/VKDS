/*
 * Builds the jig plate as a closed triangle mesh and writes binary STL.
 * Jig coordinates: millimetres, origin at the bottom-left corner, y up, z up.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PJ = Object.assign(root.PJ || {}, { mesh: api });
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const geom = (root.PJ && root.PJ.geom) || require('./geom.js');
  const earcut = root.earcut || require('../vendor/earcut.min.js');

  /** Plate outline, CCW. A chamfer on the top-left corner marks orientation. */
  function jigOutline(width, height, chamfer) {
    const c = Math.max(0, Math.min(chamfer || 0, width / 2, height / 2));
    if (!c) return [[0, 0], [width, 0], [width, height], [0, height]];
    return [[0, 0], [width, 0], [width, height], [c, height], [0, height - c]];
  }

  /**
   * opts: { width, height, thickness, depth, chamfer, pockets: [poly, ...] }
   * Pockets must lie inside the outline (the layout validation checks this).
   * Returns Float32Array of triangles (9 floats each), outward-facing winding.
   */
  function buildJigMesh(opts) {
    const { width, height, thickness: T } = opts;
    const floorZ = T - opts.depth;
    const outline = jigOutline(width, height, opts.chamfer);
    const tree = geom.unionTree(opts.pockets);
    const tris = [];

    const pushTri = (a, b, c, n) => {
      // Flip so the face normal agrees with the wanted direction n.
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * n[0] + ny * n[1] + nz * n[2] < 0) tris.push(...a, ...c, ...b);
      else tris.push(...a, ...b, ...c);
    };

    const cap = (outer, holes, z, up) => {
      const coords = [], holeIdx = [];
      const rings = [outer, ...holes];
      rings.forEach((r, i) => {
        if (i) holeIdx.push(coords.length / 2);
        for (const [x, y] of r) coords.push(x, y);
      });
      const idx = earcut(coords, holeIdx, 2);
      const P = (k) => [coords[k * 2], coords[k * 2 + 1], z];
      for (let i = 0; i < idx.length; i += 3) pushTri(P(idx[i]), P(idx[i + 1]), P(idx[i + 2]), [0, 0, up ? 1 : -1]);
    };

    // Vertical walls along a ring; leftFacing = normal points to the left of each edge.
    const walls = (ring, z0, z1, leftFacing) => {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const n = leftFacing ? [-dy, dx, 0] : [dy, -dx, 0];
        pushTri([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], n);
        pushTri([a[0], a[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], n);
      }
    };

    // Bottom and outer side walls (outline is CCW, so outward = right of each edge).
    cap(outline, [], 0, false);
    walls(outline, 0, T, false);

    // Top surface: outline minus pockets, plus solid islands enclosed by pockets.
    cap(outline, tree.topLevel, T, true);
    for (const v of tree.voids) cap(v.outer, v.holes, T, true);

    // Pocket floors and pocket walls. Union rings are CCW for outers and CW for
    // holes, so the pocket is always on the left of each edge.
    for (const f of tree.filled) cap(f.outer, f.holes, floorZ, true);
    for (const r of tree.rings) walls(r, floorZ, T, true);

    return Float32Array.from(tris);
  }

  function toBinarySTL(tris, header) {
    const n = tris.length / 9;
    const buf = new ArrayBuffer(84 + n * 50);
    const dv = new DataView(buf);
    const h = (header || 'pin jig').slice(0, 79);
    for (let i = 0; i < h.length; i++) dv.setUint8(i, h.charCodeAt(i) & 0x7f);
    dv.setUint32(80, n, true);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50;
      const t = tris.subarray(i * 9, i * 9 + 9);
      const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2];
      const vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / len, true);
      dv.setFloat32(o + 4, ny / len, true);
      dv.setFloat32(o + 8, nz / len, true);
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, t[k], true);
    }
    return buf;
  }

  return { jigOutline, buildJigMesh, toBinarySTL };
});
