/* Frame shapes. Every shape lives in a W×H mm box with origin top-left. */
(function (root) {
  'use strict';

  // Heart curve bounds (computed once) for normalisation.
  const HEART = (() => {
    const pts = [];
    for (let i = 0; i < 180; i++) {
      const t = (i / 180) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([x, y]);
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { pts, x0, y0, w: x1 - x0, h: y1 - y0 };
  })();

  const SHAPES = {
    rect:    { label: 'Rectangle', freeHeight: true },
    rounded: { label: 'Rounded rectangle', freeHeight: true },
    square:  { label: 'Square' },
    circle:  { label: 'Circle' },
    hexagon: { label: 'Hexagon' },
    heart:   { label: 'Heart' },
  };

  /* Outer bounding box in mm for a shape given the user's width (and height when free). */
  function dims(type, width, height) {
    switch (type) {
      case 'rect':
      case 'rounded': return { W: width, H: height };
      case 'hexagon': return { W: width, H: (width * Math.sqrt(3)) / 2 };
      case 'heart': return { W: width, H: (width * HEART.h) / HEART.w };
      default: return { W: width, H: width };
    }
  }

  function arc(cx, cy, r, a0, a1, n, out) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }

  /* Ring (not closed) for a shape inset by `b` mm. */
  function ring(type, W, H, b) {
    b = b || 0;
    const cx = W / 2, cy = H / 2;
    switch (type) {
      case 'rect':
      case 'square':
        return [[b, b], [W - b, b], [W - b, H - b], [b, H - b]];
      case 'rounded': {
        const r = Math.max(0.01, Math.min(W, H) * 0.08 - b);
        const x0 = b + r, x1 = W - b - r, y0 = b + r, y1 = H - b - r;
        const out = [];
        arc(x1, y0, r, -Math.PI / 2, 0, 10, out);
        arc(x1, y1, r, 0, Math.PI / 2, 10, out);
        arc(x0, y1, r, Math.PI / 2, Math.PI, 10, out);
        arc(x0, y0, r, Math.PI, Math.PI * 1.5, 10, out);
        return out;
      }
      case 'circle': {
        const r = W / 2 - b, out = [];
        for (let i = 0; i < 160; i++) {
          const a = (i / 160) * Math.PI * 2;
          out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        return out;
      }
      case 'hexagon': {
        const R = W / 2 - (2 * b) / Math.sqrt(3), out = [];
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
        }
        return out;
      }
      case 'heart': {
        const s = (W - 2 * b) / W;
        return HEART.pts.map((p) => {
          const x = ((p[0] - HEART.x0) / HEART.w) * W, y = ((p[1] - HEART.y0) / HEART.h) * H;
          return [cx + (x - cx) * s, cy + (y - cy) * s];
        });
      }
    }
    throw new Error('Unknown shape ' + type);
  }

  root.LMS = root.LMS || {};
  root.LMS.shapes = { SHAPES, dims, ring };
})(typeof window !== 'undefined' ? window : globalThis);
