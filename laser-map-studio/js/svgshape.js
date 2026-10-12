/* Import a custom frame shape from an SVG file.
   Produces a multipolygon (outlines with holes) normalised to width 1, y down. */
(function (root) {
  'use strict';
  const G = root.LMS.geom;

  /* ---------- 2D affine matrices [a, b, c, d, e, f] ---------- */

  const I = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

  function parseTransform(str) {
    let m = I;
    if (!str) return m;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let t;
    while ((t = re.exec(str))) {
      const v = (t[2].match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || []).map(Number);
      let n = I;
      switch (t[1]) {
        case 'matrix': if (v.length === 6) n = v; break;
        case 'translate': n = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
        case 'scale': n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0]; break;
        case 'rotate': {
          const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
          n = [c, s, -s, c, 0, 0];
          if (v.length >= 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
          break;
        }
        case 'skewX': n = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0]; break;
        case 'skewY': n = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
      }
      m = mul(m, n);
    }
    return m;
  }

  /* ---------- path data → subpaths of points ---------- */

  const NUM = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;

  function flattenPath(d) {
    const subs = [];
    let i = 0, cmd = '', cur = [0, 0], start = [0, 0], prevCtrl = null, prevCmd = '', pts = null;
    const n = d.length;
    const skip = () => { while (i < n && /[\s,]/.test(d[i])) i++; };
    const num = () => {
      skip();
      NUM.lastIndex = i;
      const m = NUM.exec(d);
      if (!m) throw new Error('Bad path data near "' + d.slice(i, i + 12) + '"');
      i = NUM.lastIndex;
      return parseFloat(m[0]);
    };
    const flag = () => {
      skip();
      const c = d[i++];
      if (c !== '0' && c !== '1') throw new Error('Bad arc flag');
      return c === '1';
    };
    const begin = (p) => { if (pts && pts.length > 1) subs.push(pts); pts = [p]; start = p; };
    const line = (p) => { if (!pts) pts = [cur]; pts.push(p); };

    const cubic = (p0, p1, p2, p3) => {
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        line([
          u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ]);
      }
    };
    const quad = (p0, p1, p2) => {
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, u = 1 - t;
        line([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
      }
    };
    // SVG spec F.6.5: endpoint → centre parameterisation
    const arc = (p0, rx, ry, phiDeg, large, sweep, p1) => {
      if (rx === 0 || ry === 0) return line(p1);
      rx = Math.abs(rx); ry = Math.abs(ry);
      const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
      const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
      const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
      const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
      const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
      let co = Math.sqrt(Math.max(0, num2 / den));
      if (large === sweep) co = -co;
      const cxp = (co * rx * y1) / ry, cyp = (-co * ry * x1) / rx;
      const cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2, cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
      let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI;
      if (sweep && dt < 0) dt += 2 * Math.PI;
      const segs = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 24)));
      for (let k = 1; k <= segs; k++) {
        const t = t1 + (dt * k) / segs;
        const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
        line(k === segs ? p1 : [cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
      }
    };

    while (true) {
      skip();
      if (i >= n) break;
      if (/[A-Za-z]/.test(d[i])) cmd = d[i++];
      else if (!cmd) throw new Error('Path data must start with a command');
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const P = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
      switch (C) {
        case 'M': {
          const p = P(num(), num());
          begin(p); cur = p;
          cmd = rel ? 'l' : 'L'; // following pairs are implicit lineto
          break;
        }
        case 'L': { const p = P(num(), num()); line(p); cur = p; break; }
        case 'H': { const x = num(); const p = [rel ? cur[0] + x : x, cur[1]]; line(p); cur = p; break; }
        case 'V': { const y = num(); const p = [cur[0], rel ? cur[1] + y : y]; line(p); cur = p; break; }
        case 'C': {
          const c1 = P(num(), num()), c2 = P(num(), num()), p = P(num(), num());
          cubic(cur, c1, c2, p); prevCtrl = c2; cur = p; break;
        }
        case 'S': {
          const c1 = /[CS]/.test(prevCmd) && prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur;
          const c2 = P(num(), num()), p = P(num(), num());
          cubic(cur, c1, c2, p); prevCtrl = c2; cur = p; break;
        }
        case 'Q': {
          const c1 = P(num(), num()), p = P(num(), num());
          quad(cur, c1, p); prevCtrl = c1; cur = p; break;
        }
        case 'T': {
          const c1 = /[QT]/.test(prevCmd) && prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur;
          const p = P(num(), num());
          quad(cur, c1, p); prevCtrl = c1; cur = p; break;
        }
        case 'A': {
          const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag();
          const p = P(num(), num());
          arc(cur, rx, ry, rot, large, sweep, p); cur = p; break;
        }
        case 'Z': {
          if (pts && pts.length > 1) subs.push(pts);
          pts = null; cur = start;
          break;
        }
        default: throw new Error('Unsupported path command ' + cmd);
      }
      prevCmd = C;
      if (C === 'Z') cmd = '';
    }
    if (pts && pts.length > 1) subs.push(pts);
    return subs;
  }

  /* ---------- elements → path data ---------- */

  const attr = (el, name) => parseFloat(el.getAttribute(name)) || 0;

  function elementPath(el) {
    switch (el.localName) {
      case 'path': return el.getAttribute('d') || '';
      case 'rect': {
        const x = attr(el, 'x'), y = attr(el, 'y'), w = attr(el, 'width'), h = attr(el, 'height');
        if (!(w > 0 && h > 0)) return '';
        let rx = el.hasAttribute('rx') ? attr(el, 'rx') : attr(el, 'ry');
        let ry = el.hasAttribute('ry') ? attr(el, 'ry') : rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (!(rx > 0 && ry > 0)) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
        return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
          `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
      }
      case 'circle':
      case 'ellipse': {
        const cx = attr(el, 'cx'), cy = attr(el, 'cy');
        const rx = el.localName === 'circle' ? attr(el, 'r') : attr(el, 'rx');
        const ry = el.localName === 'circle' ? rx : attr(el, 'ry');
        if (!(rx > 0 && ry > 0)) return '';
        return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
      }
      case 'polygon':
      case 'polyline': {
        const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        if (v.length < 6) return '';
        let d = `M${v[0]} ${v[1]}`;
        for (let k = 2; k + 1 < v.length; k += 2) d += `L${v[k]} ${v[k + 1]}`;
        return d + 'Z';
      }
    }
    return '';
  }

  /* Effective fill (walks up to ancestors); used to treat white shapes as holes. */
  function fillOf(el) {
    for (let e = el; e && e.getAttribute; e = e.parentNode) {
      const st = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(e.getAttribute('style') || '');
      if (st) return st[1].trim().toLowerCase();
      if (e.hasAttribute('fill')) return e.getAttribute('fill').trim().toLowerCase();
    }
    return 'black';
  }
  const isWhite = (f) => /^(white|#fff|#ffffff|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/.test(f);

  function ctm(el, svgRoot) {
    const chain = [];
    for (let e = el; e && e !== svgRoot && e.getAttribute; e = e.parentNode) chain.unshift(e.getAttribute('transform'));
    return chain.reduce((m, t) => mul(m, parseTransform(t)), I);
  }

  /* Parse SVG text → { polys (width-normalised), aspect } */
  function importSvg(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
      throw new Error('This file is not a valid SVG.');
    }
    const els = Array.from(svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline'))
      .filter((el) => !el.closest('defs, clipPath, mask, symbol, pattern, marker'));

    let acc = [];
    for (const el of els) {
      const d = elementPath(el);
      if (!d) continue;
      const m = ctm(el, svg);
      const rings = flattenPath(d)
        .map((sub) => sub.map((p) => apply(m, p)))
        .filter((r) => r.length >= 3 && Math.abs(G.ringArea(r)) > 0);
      if (!rings.length) continue;
      // Within one element, overlapping subpaths make holes (even-odd), e.g. the counter of an "O".
      let shape = [];
      for (const r of rings) {
        const g = [[r.concat([r[0]])]];
        shape = G.xor(shape, g);
      }
      // Separate elements are added together; white-filled ones are cut away.
      acc = isWhite(fillOf(el)) ? G.difference(acc, shape) : G.union(acc.concat(shape));
    }
    if (!acc.length) throw new Error('No closed shapes found in the SVG. Convert text and strokes to paths first.');

    const b = G.bbox(acc.reduce((all, poly) => all.concat(poly[0]), []));
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (!(w > 0 && h > 0)) throw new Error('The shape in this SVG has no area.');
    const tol = 0.0006;
    const polys = [];
    for (const poly of acc) {
      const rings = poly
        .map((r) => G.simplifyRing(r.map((p) => [(p[0] - b.x0) / w, (p[1] - b.y0) / w]), tol))
        .filter(Boolean)
        .map((r) => r.map((p) => [round5(p[0]), round5(p[1])]));
      if (rings.length && rings[0].length >= 4) polys.push(rings);
    }
    return { polys, aspect: h / w };
  }

  const round5 = (v) => Math.round(v * 1e5) / 1e5;

  root.LMS.svgShape = { importSvg, flattenPath, parseTransform };
})(typeof window !== 'undefined' ? window : globalThis);
