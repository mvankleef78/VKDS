/*
 * Grid layout of pins on a jig, validation, and the UV-print artwork exports.
 * Jig coordinates are y-up (for the STL); bed coordinates are y-down, origin at
 * the top-left of jig 1, matching xTool Creative Space.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PJ = Object.assign(root.PJ || {}, { layout: api });
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const geom = (root.PJ && root.PJ.geom) || require('./geom.js');
  const meshApi = (root.PJ && root.PJ.mesh) || require('./jig-mesh.js');

  /** Pin centres in jig coordinates (y up), row 0 at the top. */
  function gridCenters(jig, grid) {
    const out = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        out.push([
          jig.width / 2 + (c - (grid.cols - 1) / 2) * grid.sx,
          jig.height / 2 + ((grid.rows - 1) / 2 - r) * grid.sy,
        ]);
      }
    }
    return out;
  }

  /** As many columns/rows as fit with the requested gap between pins. */
  function autoFit(jig, pinSize, pocketSize, gap, minWall) {
    const sx = Math.round((pinSize.w + gap) * 10) / 10;
    const sy = Math.round((pinSize.h + gap) * 10) / 10;
    const fit = (len, pocket, s) => Math.max(1, Math.floor((len - 2 * minWall - pocket) / s + 1e-9) + 1);
    return { cols: fit(jig.width, pocketSize.w, sx), rows: fit(jig.height, pocketSize.h, sy), sx, sy };
  }

  /**
   * Places pocket outlines and checks them.
   * Returns { pockets, centers, issues: [{level, text}] }.
   */
  function placePockets(jig, grid, pocketPolys) {
    const centers = gridCenters(jig, grid);
    const each = centers.map(([x, y]) => geom.translate(pocketPolys, x, y));
    const pockets = each.flat();
    const issues = [];
    if (!pocketPolys.length) return { pockets, centers, issues };

    const outline = meshApi.jigOutline(jig.width, jig.height, jig.chamfer);
    const safe = geom.offset([outline], -jig.minWall);
    const outside = geom.totalArea(geom.difference(pockets, safe));
    if (outside > 1e-4) {
      issues.push({ level: 'error', text: `Pockets come closer than ${jig.minWall} mm to the jig edge (or past it). Reduce columns/rows or spacing.` });
    }
    if (each.length > 1) {
      const half = jig.minWall / 2;
      const grown = each.map((p) => geom.offset(p, half));
      const sum = grown.reduce((s, p) => s + geom.totalArea(p), 0);
      const merged = geom.totalArea(geom.union(grown.flat()));
      if (sum - merged > 1e-3) {
        const touching = geom.totalArea(geom.union(pockets)) < geom.totalArea(pockets) - 1e-3;
        issues.push(touching
          ? { level: 'error', text: 'Pockets overlap. Increase the spacing.' }
          : { level: 'warn', text: `Walls between pockets are thinner than ${jig.minWall} mm.` });
      }
    }
    return { pockets, centers, issues };
  }

  /** Jig coordinates (y up) -> bed coordinates (y down) for jig number `j`. */
  const toBed = (jig, j, [x, y]) => [j * jig.width + x, jig.height - y];

  const pathD = (polys) => polys.map((p) => 'M' + p.map(([x, y]) => `${+x.toFixed(4)} ${+y.toFixed(4)}`).join('L') + 'Z').join('');

  /**
   * Artwork placements in bed coordinates (mm, y down).
   * art: { rect: {x, y, w, h} } where rect is relative to the pin centre (y down).
   */
  function artworkPlacements(jig, centers, jigCount, rect) {
    const out = [];
    for (let j = 0; j < jigCount; j++) {
      for (const c of centers) {
        const [bx, by] = toBed(jig, j, c);
        out.push({ x: bx + rect.x, y: by + rect.y, w: rect.w, h: rect.h });
      }
    }
    return out;
  }

  // ---------- exports ----------

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Inserts a pHYs chunk so the PNG imports at its true physical size. */
  function setPngDpi(pngBytes, dpi) {
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // unit: metre
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    // Drop any existing pHYs, insert ours right after IHDR (8 sig + 25 IHDR).
    const parts = [pngBytes.subarray(0, 33), chunk];
    let p = 33;
    while (p < pngBytes.length) {
      const len = new DataView(pngBytes.buffer, pngBytes.byteOffset + p).getUint32(0);
      const type = String.fromCharCode(...pngBytes.subarray(p + 4, p + 8));
      if (type !== 'pHYs') parts.push(pngBytes.subarray(p, p + 12 + len));
      p += 12 + len;
    }
    const out = new Uint8Array(parts.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of parts) { out.set(a, o); o += a.length; }
    return out;
  }

  /** Renders the artwork placements to a transparent PNG covering the bed area. */
  async function renderLayoutPNG(image, placements, sizeMM, dpi) {
    const k = dpi / 25.4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sizeMM.w * k);
    canvas.height = Math.round(sizeMM.h * k);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (const p of placements) ctx.drawImage(image, p.x * k, p.y * k, p.w * k, p.h * k);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return new Blob([setPngDpi(bytes, dpi)], { type: 'image/png' });
  }

  /** SVG in millimetres with the artwork embedded once and reused per pin. */
  function layoutSVG(imageHref, placements, sizeMM, extras) {
    const e = extras || {};
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sizeMM.w}mm" height="${sizeMM.h}mm" viewBox="0 0 ${sizeMM.w} ${sizeMM.h}">`,
    ];
    if (e.jigOutlines) {
      lines.push(`<g id="jig-outlines" fill="none" stroke="#e5484d" stroke-width="0.2">${e.jigOutlines.map((d) => `<path d="${d}"/>`).join('')}</g>`);
    }
    lines.push('<g id="artwork">');
    for (const p of placements) {
      lines.push(`<image x="${+p.x.toFixed(4)}" y="${+p.y.toFixed(4)}" width="${+p.w.toFixed(4)}" height="${+p.h.toFixed(4)}" preserveAspectRatio="none" href="${imageHref}" xlink:href="${imageHref}"/>`);
    }
    lines.push('</g></svg>');
    return lines.join('\n');
  }

  /** Filled pocket shapes (like the video's offset export), for a slicer negative part. */
  function pocketsSVG(jig, pockets) {
    const bed = pockets.map((p) => p.map((pt) => toBed(jig, 0, pt)));
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${jig.width}mm" height="${jig.height}mm" viewBox="0 0 ${jig.width} ${jig.height}">`,
      `<path fill="#000" fill-rule="nonzero" d="${pathD(bed)}"/>`,
      '</svg>',
    ].join('\n');
  }

  return { gridCenters, autoFit, placePockets, toBed, pathD, artworkPlacements, renderLayoutPNG, layoutSVG, pocketsSVG, setPngDpi, crc32 };
});
