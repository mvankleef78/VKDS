/* Geometry helpers. All coordinates are [x, y] in millimetres, y pointing down (SVG space). */
(function (root) {
  'use strict';
  const G = {};
  const PC = () => root.polygonClipping;

  /* ---------- basics ---------- */

  G.key = (p) => p[0] + ',' + p[1];

  G.ringArea = function (ring) {
    let a = 0;
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
      a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    return a / 2;
  };

  G.polygonArea = function (poly) {
    let a = Math.abs(G.ringArea(poly[0]));
    for (let i = 1; i < poly.length; i++) a -= Math.abs(G.ringArea(poly[i]));
    return a;
  };

  G.pointInRing = function (pt, ring) {
    const x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  G.bbox = function (pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    }
    return { x0, y0, x1, y1 };
  };

  const bboxOverlap = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
  const bboxInside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
  G.bboxOverlap = bboxOverlap;

  G.isClosed = (pts) => pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];

  /* ---------- simplification (Ramer–Douglas–Peucker) ---------- */

  function segDistSq(p, a, b) {
    let x = a[0], y = a[1];
    const dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    const ex = p[0] - x, ey = p[1] - y;
    return ex * ex + ey * ey;
  }

  G.simplify = function (pts, tol) {
    if (pts.length <= 2 || !(tol > 0)) return pts;
    const sq = tol * tol;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let maxD = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = segDistSq(pts[i], pts[a], pts[b]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > sq) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  };

  /* Simplify a closed ring; returns null when it collapses. */
  G.simplifyRing = function (ring, tol) {
    if (ring.length < 4) return null;
    // split in two halves so RDP has distinct endpoints
    const mid = Math.floor(ring.length / 2);
    const a = G.simplify(ring.slice(0, mid + 1), tol);
    const b = G.simplify(ring.slice(mid), tol);
    const out = a.concat(b.slice(1));
    return out.length >= 4 ? out : null;
  };

  /* ---------- stitching ways into chains ---------- */

  G.stitch = function (lines, allowReverse) {
    const key = G.key;
    const pool = lines.filter((l) => l && l.length > 1).map((l) => l.slice());
    const byStart = new Map(), byEnd = new Map(), alive = new Set(pool);
    const add = (m, k, c) => { let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(c); };
    const del = (m, k, c) => { const a = m.get(k); if (!a) return; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); if (!a.length) m.delete(k); };
    const remove = (c) => { alive.delete(c); del(byStart, key(c[0]), c); del(byEnd, key(c[c.length - 1]), c); };
    pool.forEach((c) => { add(byStart, key(c[0]), c); add(byEnd, key(c[c.length - 1]), c); });
    const out = [];
    for (const c0 of pool) {
      if (!alive.has(c0)) continue;
      remove(c0);
      let c = c0;
      for (;;) {
        const ek = key(c[c.length - 1]);
        if (ek === key(c[0])) break;
        let nxt = byStart.get(ek), rev = false;
        nxt = nxt && nxt[0];
        if (!nxt && allowReverse) { nxt = byEnd.get(ek); nxt = nxt && nxt[0]; rev = true; }
        if (!nxt) break;
        remove(nxt);
        c = c.concat((rev ? nxt.slice().reverse() : nxt).slice(1));
      }
      for (;;) {
        const sk = key(c[0]);
        if (sk === key(c[c.length - 1])) break;
        let prv = byEnd.get(sk), rev = false;
        prv = prv && prv[0];
        if (!prv && allowReverse) { prv = byStart.get(sk); prv = prv && prv[0]; rev = true; }
        if (!prv) break;
        remove(prv);
        c = (rev ? prv.slice().reverse() : prv).slice(0, -1).concat(c);
      }
      out.push(c);
    }
    return out;
  };

  /* Build polygons ([outer, ...holes]) from multipolygon outer/inner way lists. */
  G.assembleMultipolygon = function (outers, inners) {
    const outerRings = G.stitch(outers, true).filter(G.isClosed);
    const innerRings = G.stitch(inners, true).filter(G.isClosed);
    const polys = outerRings.map((r) => [r]);
    for (const inner of innerRings) {
      const host = polys.find((p) => G.pointInRing(inner[0], p[0]));
      if (host) host.push(inner);
    }
    return polys;
  };

  /* ---------- line clipping ---------- */

  /* Liang–Barsky: clip a polyline to an axis-aligned rect.
     Returns pieces {pts, startOnEdge, endOnEdge}. */
  G.clipPolylineToRect = function (line, R) {
    const pieces = [];
    let cur = null;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      let t0 = 0, t1 = 1, ok = true;
      const p = [-dx, dx, -dy, dy];
      const q = [a[0] - R.x0, R.x1 - a[0], a[1] - R.y0, R.y1 - a[1]];
      for (let k = 0; k < 4; k++) {
        if (p[k] === 0) { if (q[k] < 0) { ok = false; break; } }
        else {
          const r = q[k] / p[k];
          if (p[k] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
          else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
        }
      }
      if (!ok || t1 - t0 < 1e-12) {
        if (cur) { pieces.push(cur); cur = null; }
        continue;
      }
      const P0 = [a[0] + dx * t0, a[1] + dy * t0], P1 = [a[0] + dx * t1, a[1] + dy * t1];
      if (t0 > 0) {
        if (cur) pieces.push(cur);
        cur = { pts: [P0], startOnEdge: true, endOnEdge: false };
      } else if (!cur) {
        cur = { pts: [a], startOnEdge: false, endOnEdge: false };
      }
      cur.pts.push(P1);
      if (t1 < 1) { cur.endOnEdge = true; pieces.push(cur); cur = null; }
    }
    if (cur) pieces.push(cur);
    return pieces.filter((p) => p.pts.length > 1);
  };

  function segIntersectT(a, b, c, d) {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    const den = rx * sy - ry * sx;
    if (den === 0) return -1;
    const qx = c[0] - a[0], qy = c[1] - a[1];
    const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return u >= 0 && u <= 1 ? t : -1;
  }

  /* Even-odd point test over every ring of a multipolygon (holes included). */
  G.pointInRings = function (pt, rings) {
    let inside = false;
    for (const r of rings) if (G.pointInRing(pt, r)) inside = !inside;
    return inside;
  };

  const allRings = (geom) => geom.reduce((acc, poly) => acc.concat(poly), []);

  /* Clip polylines to the inside of a multipolygon (outer rings minus holes). */
  G.makeLineClipper = function (geom) {
    const rings = allRings(geom);
    const rb = G.bbox(rings.reduce((acc, r) => acc.concat(r), []));
    const edges = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const c = ring[i], d = ring[(i + 1) % ring.length];
        edges.push([c, d, Math.min(c[0], d[0]), Math.max(c[0], d[0]), Math.min(c[1], d[1]), Math.max(c[1], d[1])]);
      }
    }
    return function clip(line) {
      const lb = G.bbox(line);
      if (!bboxOverlap(lb, rb)) return [];
      const out = [];
      let cur = null;
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const sx0 = Math.min(a[0], b[0]), sx1 = Math.max(a[0], b[0]), sy0 = Math.min(a[1], b[1]), sy1 = Math.max(a[1], b[1]);
        if (sx1 < rb.x0 || sx0 > rb.x1 || sy1 < rb.y0 || sy0 > rb.y1) {
          if (cur) { out.push(cur); cur = null; }
          continue;
        }
        const ts = [0, 1];
        for (const e of edges) {
          if (e[3] < sx0 || e[2] > sx1 || e[5] < sy0 || e[4] > sy1) continue;
          const t = segIntersectT(a, b, e[0], e[1]);
          if (t > 0 && t < 1) ts.push(t);
        }
        ts.sort((x, y) => x - y);
        for (let k = 0; k < ts.length - 1; k++) {
          const t0 = ts[k], t1 = ts[k + 1];
          if (t1 - t0 < 1e-9) continue;
          const inside = G.pointInRings(lerp(a, b, (t0 + t1) / 2), rings);
          if (inside) {
            const p0 = lerp(a, b, t0), p1 = lerp(a, b, t1);
            if (cur && k === 0 && t0 === 0) cur.push(p1);
            else { if (cur) out.push(cur); cur = [p0, p1]; }
          } else if (cur) { out.push(cur); cur = null; }
        }
      }
      if (cur) out.push(cur);
      return out;
    };
  };

  /* ---------- coastline → land polygons ---------- */

  /* Coastlines in OSM have land on the left (as seen on a north-up map).
     Walk the clip rect counter-clockwise (visually) to close land polygons. */
  G.coastlineToLand = function (chains, R) {
    const W = R.x1 - R.x0, H = R.y1 - R.y0, P = 2 * (W + H);
    const inside = (p) => p[0] > R.x0 && p[0] < R.x1 && p[1] > R.y0 && p[1] < R.y1;
    const islands = [], segs = [];

    const snap = (p) => {
      const d = [p[1] - R.y0, p[0] - R.x0, R.y1 - p[1], R.x1 - p[0]];
      const m = Math.min(...d), i = d.indexOf(m);
      if (i === 0) return [p[0], R.y0];
      if (i === 1) return [R.x0, p[1]];
      if (i === 2) return [p[0], R.y1];
      return [R.x1, p[1]];
    };
    const param = (p) => {
      const d = [Math.abs(p[1] - R.y0), Math.abs(p[0] - R.x0), Math.abs(p[1] - R.y1), Math.abs(p[0] - R.x1)];
      const i = d.indexOf(Math.min(...d));
      if (i === 0) return R.x1 - p[0];
      if (i === 1) return W + (p[1] - R.y0);
      if (i === 2) return W + H + (p[0] - R.x0);
      return (2 * W + H + (R.y1 - p[1])) % P;
    };
    const corners = [[W, [R.x0, R.y0]], [W + H, [R.x0, R.y1]], [2 * W + H, [R.x1, R.y1]], [0, [R.x1, R.y0]]];

    for (let chain of chains) {
      if (chain.length < 2) continue;
      const closed = G.isClosed(chain);
      if (closed) {
        const oi = chain.findIndex((p) => !inside(p));
        if (oi < 0) { islands.push(chain); continue; }
        chain = chain.slice(oi).concat(chain.slice(1, oi + 1));
      }
      for (const piece of G.clipPolylineToRect(chain, R)) {
        const pts = piece.pts.slice();
        if (!piece.startOnEdge) pts.unshift(snap(pts[0]));
        if (!piece.endOnEdge) pts.push(snap(pts[pts.length - 1]));
        segs.push(pts);
      }
    }

    const items = segs.map((pts) => ({ pts, pe: param(pts[0]), px: param(pts[pts.length - 1]), used: false }));
    const rings = [];
    for (const start of items) {
      if (start.used) continue;
      const ring = [];
      let cur = start, guard = 0;
      while (guard++ <= items.length + 1) {
        cur.used = true;
        for (const p of cur.pts) ring.push(p);
        let best = null, bestD = Infinity;
        for (const it of items) {
          if (it.used && it !== start) continue;
          let d = (((it.pe - cur.px) % P) + P) % P;
          if (d < bestD) { bestD = d; best = it; }
        }
        if (!best) break;
        const cs = corners
          .map(([cp, pt]) => [((cp - cur.px) % P + P) % P, pt])
          .filter(([d]) => d > 1e-9 && d < bestD - 1e-9)
          .sort((a, b) => a[0] - b[0]);
        for (const [, pt] of cs) ring.push(pt);
        if (best === start) break;
        cur = best;
      }
      if (ring.length >= 3) rings.push(ring);
    }
    return { rings, islands, crossing: segs.length > 0 };
  };

  /* ---------- polygon boolean wrappers (tolerant to bad input) ---------- */

  /* Snap to a fine grid: polygon-clipping is fragile with near-coincident float coordinates. */
  const snapGeom = (polys, q) => polys.map((p) => p.map((r) => r.map((pt) => [Math.round(pt[0] * q) / q, Math.round(pt[1] * q) / q])));
  const toGeom = (polys) => snapGeom(polys, 1e6);

  G.union = function (polys) {
    polys = polys.filter((p) => p && p[0] && p[0].length >= 3);
    if (!polys.length) return [];
    try {
      return PC().union(...toGeom(polys));
    } catch (e) {
      // fall back to incremental union; retry each failing polygon on a coarser grid before skipping it
      let acc = [];
      for (const p of polys) {
        for (const q of [1e6, 1e4, 1e3]) {
          try { acc = acc.length ? PC().union(snapGeom(acc, q), snapGeom([p], q)[0]) : snapGeom([p], q); break; } catch (_) { /* try coarser */ }
        }
      }
      return acc;
    }
  };

  G.xor = function (a, b) {
    if (!a.length) return b;
    try { return PC().xor(toGeom(a), toGeom(b)); } catch (e) {
      try { return PC().xor(snapGeom(a, 1e4), snapGeom(b, 1e4)); } catch (_) { return a; }
    }
  };

  G.intersect = function (a, b) {
    if (!a.length || !b.length) return [];
    try { return PC().intersection(toGeom(a), toGeom(b)); } catch (e) {
      try { return PC().intersection(snapGeom(a, 1e4), snapGeom(b, 1e4)); } catch (_) { return []; }
    }
  };

  G.difference = function (a, b) {
    if (!a.length) return [];
    if (!b.length) return a;
    try { return PC().difference(toGeom(a), toGeom(b)); } catch (e) {
      try { return PC().difference(snapGeom(a, 1e4), snapGeom(b, 1e4)); } catch (_) { return a; }
    }
  };

  /* Clip many polygons against a multipolygon, with a fast path for ones fully inside. */
  G.clipPolygonsToGeom = function (polys, geom) {
    const rings = allRings(geom);
    const rb = G.bbox(rings.reduce((acc, r) => acc.concat(r), []));
    const simpleRect = geom.length === 1 && geom[0].length === 1 && geom[0][0].length <= 5;
    const out = [];
    for (const poly of polys) {
      const pb = G.bbox(poly[0]);
      if (!bboxOverlap(pb, rb)) continue;
      const allIn = bboxInside(pb, rb) && poly[0].every((p) => G.pointInRings(p, rings));
      if (allIn && (simpleRect || !rings.some((r) => anyEdgeCross(poly[0], r)))) { out.push(poly); continue; }
      for (const r of G.intersect([poly], geom)) out.push(r);
    }
    return out;
  };

  function anyEdgeCross(a, ring) {
    for (let i = 0; i < a.length - 1; i++) {
      for (let j = 0; j < ring.length; j++) {
        const t = segIntersectT(a[i], a[i + 1], ring[j], ring[(j + 1) % ring.length]);
        if (t >= 0 && t <= 1) return true;
      }
    }
    return false;
  }

  /* Shrink a multipolygon by `b` (also widens holes): subtract a buffer around every edge. */
  G.inset = function (geom, b) {
    if (!(b > 0)) return geom;
    const pieces = [];
    const tol = Math.max(0.05, b * 0.05);
    const disc = (c) => {
      const out = [];
      for (let i = 0; i < 12; i++) {
        const a = ((i + 0.5) / 12) * Math.PI * 2; // half-step: avoid vertices exactly on the edge quads
        out.push([c[0] + b * Math.cos(a), c[1] + b * Math.sin(a)]);
      }
      return [out];
    };
    for (const poly of geom) {
      for (const ring0 of poly) {
        const closed = G.isClosed(ring0) ? ring0 : ring0.concat([ring0[0]]);
        const ring = G.simplifyRing(closed, tol) || closed;
        for (let i = 0; i < ring.length - 1; i++) {
          const p = ring[i], q = ring[i + 1];
          const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
          if (len < 1e-9) continue;
          const nx = (-dy / len) * b, ny = (dx / len) * b;
          pieces.push([[[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]]]);
          pieces.push(disc(p));
        }
      }
    }
    return G.difference(geom, G.union(pieces));
  };

  /* ---------- SVG path builders ---------- */

  const f = (n) => (Math.round(n * 100) / 100).toString();

  G.ringsToPath = function (polys) {
    let d = '';
    for (const poly of polys) {
      for (const ring of poly) {
        if (ring.length < 3) continue;
        d += 'M' + f(ring[0][0]) + ' ' + f(ring[0][1]);
        for (let i = 1; i < ring.length; i++) d += 'L' + f(ring[i][0]) + ' ' + f(ring[i][1]);
        d += 'Z';
      }
    }
    return d;
  };

  G.linesToPath = function (lines) {
    let d = '';
    for (const l of lines) {
      if (l.length < 2) continue;
      d += 'M' + f(l[0][0]) + ' ' + f(l[0][1]);
      for (let i = 1; i < l.length; i++) d += 'L' + f(l[i][0]) + ' ' + f(l[i][1]);
    }
    return d;
  };

  root.LMS = root.LMS || {};
  root.LMS.geom = G;
})(typeof window !== 'undefined' ? window : globalThis);
