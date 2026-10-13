/*
 * 2D polygon helpers on top of Clipper.
 * Polygons are arrays of [x, y] points in millimetres (or pixels before scaling).
 * Positive signed area = counter-clockwise in a y-up coordinate system.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PJ = Object.assign(root.PJ || {}, { geom: api });
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const ClipperLib = root.ClipperLib || require('../vendor/clipper.js');
  const S = 10000; // Clipper works in integers: 1 unit = 0.1 micron

  const toC = (poly) => poly.map((p) => ({ X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }));
  const fromC = (path) => path.map((p) => [p.X / S, p.Y / S]);

  function signedArea(poly) {
    let a = 0;
    for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
      a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    }
    return a / 2;
  }

  const ccw = (poly) => (signedArea(poly) < 0 ? poly.slice().reverse() : poly);
  const totalArea = (polys) => polys.reduce((s, p) => s + signedArea(p), 0);

  function bbox(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of polys) {
      for (const [x, y] of poly) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  const transform = (polys, fn) => polys.map((poly) => poly.map(fn));
  const translate = (polys, dx, dy) => transform(polys, ([x, y]) => [x + dx, y + dy]);

  function execute(clipType, subject, clip, fill) {
    const c = new ClipperLib.Clipper();
    c.AddPaths(subject.map(toC), ClipperLib.PolyType.ptSubject, true);
    if (clip && clip.length) c.AddPaths(clip.map(toC), ClipperLib.PolyType.ptClip, true);
    const sol = new ClipperLib.Paths();
    const ft = fill || ClipperLib.PolyFillType.pftNonZero;
    c.Execute(clipType, sol, ft, ft);
    return sol.map(fromC);
  }

  /** Union keeping holes (outer rings CCW, hole rings CW). */
  const union = (polys) => execute(ClipperLib.ClipType.ctUnion, polys.map(ccw));
  const difference = (a, b) => execute(ClipperLib.ClipType.ctDifference, a.map(ccw), b.map(ccw));
  const intersection = (a, b) => execute(ClipperLib.ClipType.ctIntersection, a.map(ccw), b.map(ccw));

  /** Union that discards every hole: only the outer silhouettes remain. */
  function unionOuter(polys) {
    let outers = union(polys).filter((p) => signedArea(p) > 0);
    // Outers nested inside a removed hole are swallowed by a second pass.
    outers = union(outers).filter((p) => signedArea(p) > 0);
    return outers;
  }

  /** Grow (delta > 0) or shrink (delta < 0) polygons with round joins. */
  function offset(polys, delta, arcTolerance) {
    if (!delta) return union(polys);
    const co = new ClipperLib.ClipperOffset(2, (arcTolerance || 0.005) * S);
    co.AddPaths(polys.map((p) => toC(ccw(p))), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const sol = new ClipperLib.Paths();
    co.Execute(sol, delta * S);
    return sol.map(fromC);
  }

  /**
   * Union as a tree, flattened into "solid" and "void" regions with holes,
   * ready for triangulation. Returns { rings, filled: [{outer, holes}], voids: [{outer, holes}] }
   * where filled = inside the union, voids = holes inside the union (with nested islands as holes).
   */
  function unionTree(polys) {
    const c = new ClipperLib.Clipper();
    c.AddPaths(polys.map((p) => toC(ccw(p))), ClipperLib.PolyType.ptSubject, true);
    const tree = new ClipperLib.PolyTree();
    c.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    const filled = [], voids = [], topLevel = [], rings = [];
    const walk = (node) => {
      const contour = fromC(node.Contour());
      rings.push(contour);
      const kids = node.Childs().map((k) => fromC(k.Contour()));
      (node.IsHole() ? voids : filled).push({ outer: contour, holes: kids });
      node.Childs().forEach(walk);
    };
    tree.Childs().forEach((n) => {
      topLevel.push(fromC(n.Contour()));
      walk(n);
    });
    return { rings, filled, voids, topLevel };
  }

  /** Ramer–Douglas–Peucker simplification for a closed ring. */
  function simplifyClosed(poly, eps) {
    if (poly.length < 8 || eps <= 0) return poly;
    // Split the ring at the two points furthest apart so both halves are open polylines.
    let far = 0, best = -1;
    for (let i = 1; i < poly.length; i++) {
      const d = (poly[i][0] - poly[0][0]) ** 2 + (poly[i][1] - poly[0][1]) ** 2;
      if (d > best) { best = d; far = i; }
    }
    const a = rdp(poly.slice(0, far + 1), eps);
    const b = rdp(poly.slice(far).concat([poly[0]]), eps);
    return a.slice(0, -1).concat(b.slice(0, -1));
  }

  function rdp(pts, eps) {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    const eps2 = eps * eps;
    while (stack.length) {
      const [s, e] = stack.pop();
      const [ax, ay] = pts[s], [bx, by] = pts[e];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-12;
      let maxD = -1, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const [px, py] = pts[i];
        const cross = (px - ax) * dy - (py - ay) * dx;
        const d = (cross * cross) / len2;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps2) {
        keep[idx] = 1;
        stack.push([s, idx], [idx, e]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  return {
    signedArea, ccw, totalArea, bbox, transform, translate,
    union, unionOuter, difference, intersection, offset, unionTree, simplifyClosed,
  };
});
