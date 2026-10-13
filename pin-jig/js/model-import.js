/*
 * Reads a pin model (STL or 3MF, e.g. exported from MakerWorld's image-to-keychain)
 * and returns its footprint seen from above, in millimetres (y up).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PJ = Object.assign(root.PJ || {}, { model: api });
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const geom = (root.PJ && root.PJ.geom) || require('./geom.js');

  // ---------- STL ----------

  /** Returns a Float32Array with 9 numbers (3 vertices) per triangle. */
  function parseSTL(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength >= 84) {
      const n = dv.getUint32(80, true);
      if (84 + n * 50 === buf.byteLength) {
        const out = new Float32Array(n * 9);
        for (let i = 0; i < n; i++) {
          const o = 84 + i * 50 + 12;
          for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true);
        }
        return out;
      }
    }
    const text = new TextDecoder().decode(buf);
    const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    const vals = [];
    let m;
    while ((m = re.exec(text))) vals.push(+m[1], +m[2], +m[3]);
    if (!vals.length || vals.length % 9) throw new Error('Could not read this STL file.');
    return Float32Array.from(vals);
  }

  // ---------- ZIP (for 3MF) ----------

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Minimal ZIP reader (stored + deflate, zip64 aware). */
  async function unzip(buf, wanted) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This file is not a valid 3MF (zip) archive.');
    let count = dv.getUint16(eocd + 10, true);
    let cdOff = dv.getUint32(eocd + 16, true);
    if (cdOff === 0xffffffff || count === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
        const z64 = Number(dv.getBigUint64(loc + 8, true));
        count = Number(dv.getBigUint64(z64 + 32, true));
        cdOff = Number(dv.getBigUint64(z64 + 48, true));
      }
    }
    const files = {};
    let p = cdOff;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      let comp = dv.getUint32(p + 20, true);
      let uncomp = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      let local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      // zip64 extra field
      let e = p + 46 + nameLen;
      const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = dv.getUint16(e, true), size = dv.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncomp === 0xffffffff) { uncomp = Number(dv.getBigUint64(q, true)); q += 8; }
          if (comp === 0xffffffff) { comp = Number(dv.getBigUint64(q, true)); q += 8; }
          if (local === 0xffffffff) { local = Number(dv.getBigUint64(q, true)); q += 8; }
        }
        e += 4 + size;
      }
      p = eEnd + commentLen;
      if (!wanted(name)) continue;
      const lNameLen = dv.getUint16(local + 26, true);
      const lExtraLen = dv.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      const raw = u8.subarray(start, start + comp);
      if (method === 0) files[name] = raw.slice();
      else if (method === 8) files[name] = await inflateRaw(raw);
      else throw new Error(`Unsupported zip compression (${method}) in ${name}.`);
    }
    return files;
  }

  // ---------- 3MF ----------

  const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const parseMatrix = (s) => (s ? s.trim().split(/\s+/).map(Number) : IDENTITY);
  // Row-vector 3MF matrices: p' = p * M. Combined "first a, then b" = a * b.
  function mul(a, b) {
    const r = new Array(12);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j] + (i === 3 ? b[9 + j] : 0);
      }
    }
    return r;
  }
  const kids = (el, name) => Array.from(el.children).filter((c) => c.localName === name);
  const kid = (el, name) => kids(el, name)[0];
  const attrLocal = (el, name) => {
    for (const a of el.attributes) if (a.localName === name) return a.value;
    return null;
  };
  const normPath = (p) => p.replace(/^\/+/, '').toLowerCase();

  async function parse3MF(buf) {
    const raw = await unzip(buf, (n) => /\.model$/i.test(n));
    const docs = {};
    const parser = new DOMParser();
    for (const [name, bytes] of Object.entries(raw)) {
      docs[normPath(name)] = parser.parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    }
    const rootPath = Object.keys(docs).find((n) => n.endsWith('3dmodel.model')) || Object.keys(docs)[0];
    if (!rootPath) throw new Error('No 3D model found inside this 3MF.');
    const objects = new Map();
    for (const [path, doc] of Object.entries(docs)) {
      for (const obj of doc.getElementsByTagNameNS('*', 'object')) objects.set(`${path}#${obj.getAttribute('id')}`, obj);
    }
    const tris = [];
    const emit = (path, id, M, depth) => {
      const obj = objects.get(`${path}#${id}`);
      if (!obj || depth > 16) return;
      const mesh = kid(obj, 'mesh');
      if (mesh) {
        const verts = kids(kid(mesh, 'vertices'), 'vertex').map((v) => {
          const x = +v.getAttribute('x'), y = +v.getAttribute('y'), z = +v.getAttribute('z');
          return [
            x * M[0] + y * M[3] + z * M[6] + M[9],
            x * M[1] + y * M[4] + z * M[7] + M[10],
            x * M[2] + y * M[5] + z * M[8] + M[11],
          ];
        });
        for (const t of kids(kid(mesh, 'triangles'), 'triangle')) {
          for (const k of ['v1', 'v2', 'v3']) tris.push(...verts[+t.getAttribute(k)]);
        }
      }
      const comps = kid(obj, 'components');
      if (comps) {
        for (const c of kids(comps, 'component')) {
          const p = attrLocal(c, 'path');
          emit(p ? normPath(p) : path, c.getAttribute('objectid'), mul(parseMatrix(c.getAttribute('transform')), M), depth + 1);
        }
      }
    };
    const build = docs[rootPath].getElementsByTagNameNS('*', 'build')[0];
    const items = build ? kids(build, 'item') : [];
    for (const item of items) {
      const p = attrLocal(item, 'path');
      emit(p ? normPath(p) : rootPath, item.getAttribute('objectid'), parseMatrix(item.getAttribute('transform')), 0);
    }
    if (!tris.length) throw new Error('The 3MF did not contain any mesh triangles.');
    return { triangles: Float32Array.from(tris), items: items.length };
  }

  // ---------- footprint ----------

  /** Top-down silhouette of a triangle soup, centred on its bounding box. */
  function footprint(tris) {
    const down = [], all = [];
    for (let i = 0; i < tris.length; i += 9) {
      const t = [[tris[i], tris[i + 1]], [tris[i + 3], tris[i + 4]], [tris[i + 6], tris[i + 7]]];
      const a = geom.signedArea(t);
      if (Math.abs(a) < 1e-6) continue; // vertical wall
      all.push(t);
      if (a < 0) down.push(t); // clockwise seen from above = faces downward
    }
    // Downward faces alone cover the footprint of an extruded pin and are far fewer.
    let polys = down.length ? geom.unionOuter(down) : [];
    const full = geom.totalArea(polys);
    if (!polys.length || full < 1e-3) polys = geom.unionOuter(all);
    if (!polys.length) throw new Error('The model has no footprint (is it empty?).');
    polys = polys.map((p) => geom.simplifyClosed(p, 0.005));
    const b = geom.bbox(polys);
    return geom.translate(polys, -b.cx, -b.cy);
  }

  async function loadFootprint(file) {
    const buf = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    let tris, items = 1;
    if (name.endsWith('.3mf')) ({ triangles: tris, items } = await parse3MF(buf));
    else tris = parseSTL(buf);
    return { polys: footprint(tris), items };
  }

  return { parseSTL, unzip, parse3MF, footprint, loadFootprint };
});
