/* MapTiler vector tiles (OpenMapTiles schema): download, decode and turn into map features.
   Contains a small Mapbox Vector Tile (protobuf) decoder so no extra libraries are needed. */
(function (root) {
  'use strict';
  const G = root.LMS.geom;

  /* ---------- protobuf reader ---------- */

  const utf8 = new TextDecoder();

  class Reader {
    constructor(buf) { this.b = buf; this.p = 0; this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
    varint() {
      let r = 0, s = 1, b;
      do { b = this.b[this.p++]; r += (b & 0x7f) * s; s *= 128; } while (b >= 128);
      return r;
    }
    bytes() { const l = this.varint(), s = this.b.subarray(this.p, this.p + l); this.p += l; return s; }
    string() { return utf8.decode(this.bytes()); }
    packed() { const end = this.varint() + this.p, a = []; while (this.p < end) a.push(this.varint()); return a; }
    skip(wire) {
      if (wire === 0) this.varint();
      else if (wire === 1) this.p += 8;
      else if (wire === 2) { const len = this.varint(); this.p += len; } // read len first: `p += varint()` would use the old p
      else if (wire === 5) this.p += 4;
      else throw new Error('Unsupported protobuf wire type ' + wire);
    }
  }

  const zz = (n) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

  function readValue(r) {
    const end = r.varint() + r.p;
    let v = null;
    while (r.p < end) {
      const tag = r.varint(), f = tag >> 3, w = tag & 7;
      if (f === 1) v = r.string();
      else if (f === 2) { v = r.dv.getFloat32(r.p, true); r.p += 4; }
      else if (f === 3) { v = r.dv.getFloat64(r.p, true); r.p += 8; }
      else if (f === 4 || f === 5) v = r.varint();
      else if (f === 6) v = zz(r.varint());
      else if (f === 7) v = r.varint() === 1;
      else r.skip(w);
    }
    return v;
  }

  function readFeature(r) {
    const end = r.varint() + r.p;
    const f = { type: 0, tags: [], geom: [] };
    while (r.p < end) {
      const tag = r.varint(), fld = tag >> 3, w = tag & 7;
      if (fld === 2) f.tags = r.packed();
      else if (fld === 3) f.type = r.varint();
      else if (fld === 4) f.geom = r.packed();
      else r.skip(w);
    }
    return f;
  }

  /* Decode the layers we care about: { name: { extent, features: [{type, props, geom}] } } */
  function decodeTile(buf, wanted) {
    const r = new Reader(buf), layers = {};
    while (r.p < r.b.length) {
      const tag = r.varint();
      if (tag >> 3 !== 3) { r.skip(tag & 7); continue; }
      const end = r.varint() + r.p;
      const L = { name: '', extent: 4096, keys: [], values: [], raw: [] };
      while (r.p < end) {
        const t = r.varint(), f = t >> 3, w = t & 7;
        if (f === 1) L.name = r.string();
        else if (f === 2) {
          if (wanted && L.name && !wanted.has(L.name)) r.skip(w); // name comes first in practice
          else L.raw.push(readFeature(r));
        } else if (f === 3) L.keys.push(r.string());
        else if (f === 4) L.values.push(readValue(r));
        else if (f === 5) L.extent = r.varint();
        else r.skip(w);
      }
      if (wanted && !wanted.has(L.name)) continue;
      layers[L.name] = {
        extent: L.extent,
        features: L.raw.map((ft) => {
          const props = {};
          for (let i = 0; i + 1 < ft.tags.length; i += 2) props[L.keys[ft.tags[i]]] = L.values[ft.tags[i + 1]];
          return { type: ft.type, props, geom: ft.geom };
        }),
      };
    }
    return layers;
  }

  /* Geometry commands → parts (lines or rings) in tile coordinates. */
  function decodeGeom(cmds) {
    const parts = [];
    let x = 0, y = 0, cur = null, i = 0;
    while (i < cmds.length) {
      const c = cmds[i++], id = c & 7, count = c >> 3;
      if (id === 1) {
        for (let k = 0; k < count; k++) { x += zz(cmds[i++]); y += zz(cmds[i++]); cur = [[x, y]]; parts.push(cur); }
      } else if (id === 2) {
        for (let k = 0; k < count; k++) { x += zz(cmds[i++]); y += zz(cmds[i++]); cur.push([x, y]); }
      } else if (id === 7) {
        if (cur) cur.push([cur[0][0], cur[0][1]]);
      } else break;
    }
    return parts;
  }

  /* Rings → polygons: exterior rings have positive area in tile space (spec v2). */
  function ringsToPolygons(rings) {
    const polys = [];
    for (const r of rings) {
      if (r.length < 4) continue;
      const a = G.ringArea(r);
      if (a === 0) continue;
      // G.ringArea's sign convention is opposite to the MVT "surveyor's formula"
      if (a < 0 || !polys.length) polys.push([r]);
      else polys[polys.length - 1].push(r);
    }
    return polys;
  }

  /* ---------- tile math ---------- */

  const lon2x = (lon, n) => ((lon + 180) / 360) * n;
  const lat2y = (lat, n) => {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  };

  function tileRange(bbox, z) {
    const n = 2 ** z;
    const clampT = (v) => Math.max(0, Math.min(n - 1, Math.floor(v)));
    return { z, x0: clampT(lon2x(bbox.w, n)), x1: clampT(lon2x(bbox.e, n)), y0: clampT(lat2y(bbox.n, n)), y1: clampT(lat2y(bbox.s, n)) };
  }

  /* Highest zoom (≤14, the max for these tiles) that keeps the download reasonable. */
  function pickZoom(bbox, maxTiles) {
    for (let z = 14; z >= 6; z--) {
      const t = tileRange(bbox, z);
      if ((t.x1 - t.x0 + 1) * (t.y1 - t.y0 + 1) <= maxTiles) return t;
    }
    return tileRange(bbox, 6);
  }

  /* ---------- feature mapping (OpenMapTiles → our kinds) ---------- */

  const ROAD_MAP = { motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary',
    minor: 'residential', service: 'service', track: 'track', path: 'footway', busway: 'service' };
  const DETAIL = {
    major: new Set(['motorway', 'trunk', 'primary', 'secondary']),
    medium: new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']),
    all: new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track', 'path', 'busway']),
  };
  const RAIL = new Set(['rail', 'transit']);
  const PARK_SKIP = new Set(['national_park', 'protected_area', 'nature_reserve', 'aboriginal_lands']);

  /* ---------- download + assemble ---------- */

  /* Ask MapTiler's TileJSON for the real tile URL instead of guessing it.
     Tries the current OpenMapTiles tileset first, then the older "v3" id. */
  const TILESETS = ['v3-openmaptiles', 'v3'];
  const templates = new Map();

  async function tileTemplate(key) {
    if (templates.has(key)) return templates.get(key);
    const problems = [];
    for (const id of TILESETS) {
      let res;
      try {
        res = await fetch(`https://api.maptiler.com/tiles/${id}/tiles.json?key=${encodeURIComponent(key)}`);
      } catch (e) {
        throw new Error('Network error while contacting MapTiler.');
      }
      if (res.status === 401 || res.status === 403) {
        const err = new Error('MapTiler rejected the API key – check it under "Map data" (Account → API keys on maptiler.com).');
        err.auth = true;
        throw err;
      }
      const text = await res.text();
      let tj = null;
      try { tj = JSON.parse(text); } catch (_) { /* not JSON */ }
      if (res.ok && tj && Array.isArray(tj.tiles) && tj.tiles.length) {
        let url = tj.tiles[0];
        if (!/[?&]key=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
        const t = { url, maxzoom: Math.min(14, tj.maxzoom || 14) };
        templates.set(key, t);
        return t;
      }
      problems.push(`${id}: HTTP ${res.status} ${snippet(text)}`);
    }
    throw new Error('MapTiler has no vector tileset for this key (' + problems.join('; ') + ')');
  }

  const snippet = (text) => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  async function fetchTile(z, x, y, key, signal) {
    const tpl = await tileTemplate(key);
    const url = tpl.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await fetch(url, { signal });
      } catch (e) {
        if (attempt === 2) throw new Error('Network error while downloading MapTiler tiles.');
        continue;
      }
      if (res.status === 204 || res.status === 404) return null; // empty (e.g. open sea)
      if (res.status === 401 || res.status === 403) {
        const err = new Error('MapTiler rejected the API key – check it under "Map data" (Account → API keys on maptiler.com).');
        err.auth = true;
        throw err;
      }
      if (res.status === 429) {
        const err = new Error('MapTiler usage limit reached for this key.');
        err.auth = true;
        throw err;
      }
      if (res.ok) {
        const buf = await gunzipIfNeeded(new Uint8Array(await res.arrayBuffer()));
        // A text/HTML answer instead of a vector tile: surface what the server said.
        if (buf.length && (buf[0] === 0x3c || buf[0] === 0x7b)) {
          throw new Error(`MapTiler sent text instead of map data: "${snippet(new TextDecoder().decode(buf.subarray(0, 600)))}"`);
        }
        return buf;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    throw new Error('MapTiler tile download failed repeatedly.');
  }

  /* Some servers send tiles still gzip-compressed (without a Content-Encoding header). */
  async function gunzipIfNeeded(buf) {
    if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) return buf;
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack compressed tiles – please update it.');
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* Load features for a lon/lat bbox. Returns raw data in global tile-pixel coordinates
     plus a toLonLat function; use projectRaw() to convert to millimetres. */
  async function load(bbox, opts, key, onStatus) {
    await tileTemplate(key); // resolve the tile URL (and validate the key) once up front
    const t = pickZoom(bbox, opts.maxTiles || 64);
    const tiles = [];
    for (let x = t.x0; x <= t.x1; x++) for (let y = t.y0; y <= t.y1; y++) tiles.push([x, y]);
    const wanted = new Set(['water', 'waterway', 'transportation', 'building', 'park', 'landcover']);
    const raw = { coast: [], water: [], waterways: [], roads: [], rails: [], buildings: [], parks: [] };
    const edgeBuildings = [];
    const detail = DETAIL[opts.detail] || DETAIL.all;
    let done = 0, extent = 4096;
    const badTiles = [];

    const ctrl = new AbortController();
    const handle = async ([tx, ty]) => {
      const buf = await fetchTile(t.z, tx, ty, key, ctrl.signal);
      done++;
      onStatus && onStatus(`Downloading MapTiler tiles… ${done}/${tiles.length}`);
      if (!buf) return;
      let layers;
      try {
        layers = decodeTile(buf, wanted);
      } catch (e) {
        // one unreadable tile should not sink the whole map
        console.error(`MapTiler tile ${t.z}/${tx}/${ty} could not be read`, e, buf.subarray(0, 16));
        badTiles.push(e.message);
        return;
      }
      for (const [name, layer] of Object.entries(layers)) {
        const E = layer.extent;
        extent = E;
        const ox = tx * E, oy = ty * E;
        const R = { x0: 0, y0: 0, x1: E, y1: E };
        const square = [[[[0, 0], [E, 0], [E, E], [0, E], [0, 0]]]];
        const shift = (pts) => pts.map((p) => [p[0] + ox, p[1] + oy]);
        const lines = (f) => {
          const out = [];
          for (const part of decodeGeom(f.geom)) for (const piece of G.clipPolylineToRect(part, R)) out.push(shift(piece.pts));
          return out;
        };
        // Polygons are clipped to the exact tile square so neighbouring tiles don't overlap.
        const polys = (f, onEdge) => {
          const out = [];
          for (const poly of ringsToPolygons(decodeGeom(f.geom))) {
            const b = G.bbox(poly[0]);
            const inside = b.x0 >= 0 && b.y0 >= 0 && b.x1 <= E && b.y1 <= E;
            const pieces = inside ? [poly] : G.intersect([poly], square);
            for (const p of pieces) {
              const shifted = p.map(shift);
              if (!inside && onEdge) onEdge.push(shifted); else out.push(shifted);
            }
          }
          return out;
        };
        for (const f of layer.features) {
          const p = f.props;
          if (name === 'water' && opts.water && f.type === 3) {
            if (p.class === 'swimming_pool' || p.brunnel === 'tunnel') continue;
            raw.water.push(...polys(f));
          } else if (name === 'waterway' && opts.waterways && f.type === 2) {
            if (p.brunnel === 'tunnel' || !/^(river|canal|stream)$/.test(p.class)) continue;
            for (const l of lines(f)) raw.waterways.push({ cls: p.class, pts: l });
          } else if (name === 'transportation' && f.type === 2) {
            if (p.brunnel === 'tunnel') continue;
            if (RAIL.has(p.class)) {
              if (opts.rails && !/subway|funicular|monorail/.test(p.subclass || '') && !p.service) {
                raw.rails.push(...lines(f));
              }
            } else if (opts.roads && detail.has(p.class)) {
              let cls = ROAD_MAP[p.class];
              if (p.ramp === 1 && /^(motorway|trunk|primary|secondary|tertiary)$/.test(cls)) cls += '_link';
              if (p.class === 'path' && p.subclass && ROAD_MAP[p.subclass] === undefined && /^(cycleway|steps|pedestrian|bridleway)$/.test(p.subclass)) cls = p.subclass;
              for (const l of lines(f)) raw.roads.push({ cls, pts: l });
            }
          } else if (name === 'building' && opts.buildings && f.type === 3) {
            if (p.hide_3d) continue;
            raw.buildings.push(...polys(f, edgeBuildings));
          } else if (name === 'park' && opts.parks && f.type === 3) {
            if (PARK_SKIP.has(p.class)) continue;
            raw.parks.push(...polys(f));
          } else if (name === 'landcover' && opts.parks && f.type === 3) {
            if (p.class !== 'wood' && p.class !== 'grass') continue;
            raw.parks.push(...polys(f));
          }
        }
      }
    };

    // small worker pool
    const queue = tiles.slice();
    const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
      while (queue.length) await handle(queue.shift());
    });
    try {
      await Promise.all(workers);
    } catch (e) {
      ctrl.abort();
      throw e;
    }

    if (badTiles.length && badTiles.length >= tiles.length) {
      throw new Error(`none of the ${tiles.length} tiles could be read (${badTiles[0]})`);
    }

    // Re-join buildings that were split by tile edges.
    if (edgeBuildings.length) raw.buildings.push(...G.union(edgeBuildings));

    const n = 2 ** t.z;
    const toLonLat = (p) => {
      const fx = p[0] / extent / n, fy = p[1] / extent / n;
      return [fx * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * 180) / Math.PI];
    };
    return { raw, toLonLat, zoom: t.z, tiles: tiles.length };
  }

  /* Convert raw tile-pixel features to millimetres with proj(lat, lon). */
  function projectRaw(res, proj) {
    const P = (pts) => pts.map((p) => { const ll = res.toLonLat(p); return proj(ll[1], ll[0]); });
    const PP = (polys) => polys.map((poly) => poly.map(P));
    const r = res.raw;
    return {
      coast: [],
      water: PP(r.water),
      waterways: r.waterways.map((w) => ({ cls: w.cls, pts: P(w.pts) })),
      roads: r.roads.map((w) => ({ cls: w.cls, pts: P(w.pts) })),
      rails: r.rails.map(P),
      buildings: PP(r.buildings),
      parks: PP(r.parks),
    };
  }

  /* Key check: download and decode one detailed tile at the given position. */
  async function testKey(key, lat, lon) {
    const n = 2 ** 14;
    const x = Math.floor(lon2x(lon, n)), y = Math.floor(lat2y(lat, n));
    const buf = await fetchTile(14, x, y, key);
    if (!buf) return { layers: 0, features: 0 };
    const layers = decodeTile(buf);
    const names = Object.keys(layers);
    return { layers: names.length, features: names.reduce((a, k) => a + layers[k].features.length, 0) };
  }

  root.LMS.mvt = { load, projectRaw, testKey, decodeTile, decodeGeom, ringsToPolygons, pickZoom };
})(typeof window !== 'undefined' ? window : globalThis);
