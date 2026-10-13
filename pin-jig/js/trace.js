/*
 * Bitmap -> outline. Builds a solid/empty mask from an image (transparency or
 * background colour) and traces it with marching squares.
 * Output loops are in pixel coordinates (y down).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PJ = Object.assign(root.PJ || {}, { trace: api });
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const geom = (root.PJ && root.PJ.geom) || require('./geom.js');

  /** Fraction of pixels that are (partly) transparent. */
  function transparentShare(img) {
    const d = img.data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) n++;
    return n / (img.width * img.height);
  }

  /** Average colour of the four corner pixels, used as the background colour. */
  function cornerColor(img) {
    const { width: w, height: h, data: d } = img;
    const idx = [0, w - 1, (h - 1) * w, h * w - 1];
    const c = [0, 0, 0];
    for (const i of idx) for (let k = 0; k < 3; k++) c[k] += d[i * 4 + k] / 4;
    return c;
  }

  /**
   * opts.mode: 'auto' | 'alpha' | 'color'
   * opts.alphaThreshold: 0..255 (pixel is solid when alpha > threshold)
   * opts.colorTolerance: 0..442 (pixel is solid when RGB distance from background > tolerance)
   */
  function buildMask(img, opts) {
    const o = Object.assign({ mode: 'auto', alphaThreshold: 128, colorTolerance: 48 }, opts);
    let mode = o.mode;
    if (mode === 'auto') mode = transparentShare(img) > 0.005 ? 'alpha' : 'color';
    const { width: w, height: h, data: d } = img;
    const mask = new Uint8Array(w * h);
    if (mode === 'alpha') {
      for (let i = 0; i < w * h; i++) mask[i] = d[i * 4 + 3] > o.alphaThreshold ? 1 : 0;
    } else {
      const bg = cornerColor(img);
      const tol2 = o.colorTolerance * o.colorTolerance;
      for (let i = 0; i < w * h; i++) {
        const a = d[i * 4 + 3];
        if (a < 128) continue;
        const dr = d[i * 4] - bg[0], dg = d[i * 4 + 1] - bg[1], db = d[i * 4 + 2] - bg[2];
        mask[i] = dr * dr + dg * dg + db * db > tol2 ? 1 : 0;
      }
    }
    return { mask, width: w, height: h, mode };
  }

  /**
   * Marching squares on a binary mask. Samples sit at pixel centres; the mask is
   * padded with empty pixels so every loop closes. Saddles connect the solid
   * diagonal. Returns closed loops in pixel coordinates.
   */
  function marchingSquares(mask, w, h) {
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
    const W = w + 2;
    // Edge midpoint ids: horizontal edge starting at sample (x,y) and vertical edge starting at (x,y).
    const hId = (x, y) => ((y + 1) * W + (x + 1)) * 2;
    const vId = (x, y) => ((y + 1) * W + (x + 1)) * 2 + 1;
    const pos = new Map();
    const adj = new Map();
    const link = (a, b) => {
      let la = adj.get(a); if (!la) adj.set(a, (la = []));
      let lb = adj.get(b); if (!lb) adj.set(b, (lb = []));
      la.push(b); lb.push(a);
    };
    for (let y = -1; y < h; y++) {
      for (let x = -1; x < w; x++) {
        const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
        const c = tl * 8 + tr * 4 + br * 2 + bl;
        if (c === 0 || c === 15) continue;
        const T = hId(x, y), B = hId(x, y + 1), L = vId(x, y), R = vId(x + 1, y);
        if (!pos.has(T)) pos.set(T, [x + 1, y + 0.5]);
        if (!pos.has(B)) pos.set(B, [x + 1, y + 1.5]);
        if (!pos.has(L)) pos.set(L, [x + 0.5, y + 1]);
        if (!pos.has(R)) pos.set(R, [x + 1.5, y + 1]);
        switch (c) {
          case 1: case 14: link(L, B); break;
          case 2: case 13: link(B, R); break;
          case 3: case 12: link(L, R); break;
          case 4: case 11: link(T, R); break;
          case 6: case 9: link(T, B); break;
          case 7: case 8: link(L, T); break;
          case 5: link(L, T); link(R, B); break; // tr+bl solid, cut off tl and br
          case 10: link(T, R); link(L, B); break; // tl+br solid, cut off tr and bl
        }
      }
    }
    const loops = [];
    const seen = new Set();
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let prev = -1, cur = start;
      while (!seen.has(cur)) {
        seen.add(cur);
        loop.push(pos.get(cur));
        const n = adj.get(cur);
        const next = n[0] !== prev ? n[0] : n[1];
        prev = cur;
        cur = next;
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  /**
   * Image -> filled outer outline in pixel space (y down).
   * Holes are discarded because the jig only needs the pin's silhouette.
   */
  function traceOutline(img, opts) {
    const { mask, width, height, mode } = buildMask(img, opts);
    let solid = 0;
    for (let i = 0; i < mask.length; i++) solid += mask[i];
    if (!solid) return { polys: [], mode, width, height };
    const loops = marchingSquares(mask, width, height).map((l) => geom.simplifyClosed(l, 0.6));
    const polys = geom.unionOuter(loops);
    return { polys, mode, width, height };
  }

  /** Bounding box of non-transparent / non-background pixels, in pixels. */
  function contentBox(img, opts) {
    const { mask, width: w, height: h } = buildMask(img, opts);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return { x0: 0, y0: 0, x1: w, y1: h, w, h };
    return { x0, y0, x1: x1 + 1, y1: y1 + 1, w: x1 + 1 - x0, h: y1 + 1 - y0 };
  }

  return { buildMask, marchingSquares, traceOutline, contentBox, transparentShare };
});
