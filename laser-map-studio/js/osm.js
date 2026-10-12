/* OpenStreetMap data: Overpass query building, fetching and parsing into projected features. */
(function (root) {
  'use strict';
  const G = root.LMS.geom;

  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  const ROAD_CLASSES = {
    major: ['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'],
    medium: ['tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street'],
    all: ['service', 'pedestrian', 'track', 'footway', 'path', 'cycleway', 'steps', 'bridleway'],
  };

  /* Relative road weight (mm at width scale 1). */
  const ROAD_WIDTH = {
    motorway: 1.1, trunk: 1.0, primary: 0.85, secondary: 0.7, tertiary: 0.55,
    motorway_link: 0.6, trunk_link: 0.55, primary_link: 0.5, secondary_link: 0.45, tertiary_link: 0.4,
    residential: 0.4, unclassified: 0.4, living_street: 0.35,
    service: 0.25, pedestrian: 0.25, track: 0.2, footway: 0.15, path: 0.15, cycleway: 0.15, steps: 0.15, bridleway: 0.15,
  };
  const WATERWAY_WIDTH = { river: 1.0, canal: 0.7, stream: 0.3 };

  function roadClasses(detail) {
    if (detail === 'major') return ROAD_CLASSES.major;
    if (detail === 'medium') return ROAD_CLASSES.major.concat(ROAD_CLASSES.medium);
    return ROAD_CLASSES.major.concat(ROAD_CLASSES.medium, ROAD_CLASSES.all);
  }

  /* bbox: {s, w, n, e}; opts: which features to request. */
  function buildQuery(bbox, opts) {
    const b = [bbox.s, bbox.w, bbox.n, bbox.e].map((v) => v.toFixed(6)).join(',');
    const q = [];
    q.push(`way["natural"="coastline"](${b});`);
    if (opts.water) {
      q.push(`way["natural"="water"](${b});`, `relation["natural"="water"](${b});`);
      q.push(`way["waterway"~"^(riverbank|dock)$"](${b});`, `relation["waterway"="riverbank"](${b});`);
      q.push(`way["landuse"~"^(reservoir|basin)$"](${b});`, `relation["landuse"~"^(reservoir|basin)$"](${b});`);
    }
    if (opts.waterways) q.push(`way["waterway"~"^(river|canal|stream)$"]["tunnel"!~"yes|culvert"](${b});`);
    if (opts.roads) q.push(`way["highway"~"^(${roadClasses(opts.detail).join('|')})$"]["tunnel"!="yes"]["area"!="yes"](${b});`);
    if (opts.rails) q.push(`way["railway"~"^(rail|light_rail|narrow_gauge|tram)$"]["tunnel"!="yes"]["service"!~"."](${b});`);
    if (opts.buildings) q.push(`way["building"]["building"!="no"](${b});`, `relation["building"]["type"="multipolygon"](${b});`);
    if (opts.parks) {
      q.push(`way["leisure"~"^(park|garden|golf_course|nature_reserve|common)$"](${b});`);
      q.push(`relation["leisure"~"^(park|garden|golf_course|nature_reserve)$"](${b});`);
      q.push(`way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery|village_green)$"](${b});`);
      q.push(`relation["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"](${b});`);
      q.push(`way["natural"="wood"](${b});`, `relation["natural"="wood"](${b});`);
    }
    return `[out:json][timeout:90][maxsize:805306368];\n(\n  ${q.join('\n  ')}\n);\nout geom;`;
  }

  async function fetchOverpass(query, onStatus) {
    let lastErr;
    for (const url of ENDPOINTS) {
      const host = new URL(url).host;
      try {
        onStatus && onStatus(`Downloading map data from ${host}…`);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 100000); // a hung server rarely recovers; move on
        const res = await fetch(url, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          signal: ctrl.signal,
        });
        if (!res.ok) { clearTimeout(timer); throw new Error(`${host} answered HTTP ${res.status}`); }
        const json = await res.json(); // the body can also stall, so the timer covers it too
        clearTimeout(timer);
        if (json.remark && /runtime error|out of memory/i.test(json.remark)) throw new Error(json.remark);
        return json;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error('Could not load OpenStreetMap data (' + (lastErr ? lastErr.message : 'unknown error') + '). Try a smaller area or fewer features.');
  }

  /* Classify tags into a feature kind. */
  function classify(t) {
    if (!t) return null;
    if (t.natural === 'coastline') return 'coast';
    if (t.building && t.building !== 'no') return 'building';
    if (t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' ||
        t.landuse === 'reservoir' || t.landuse === 'basin') return 'water';
    if (t.waterway === 'river' || t.waterway === 'canal' || t.waterway === 'stream') return 'waterway';
    if (t.highway && ROAD_WIDTH[t.highway] !== undefined) return 'road';
    if (t.railway) return 'rail';
    if (t.leisure || t.landuse || t.natural === 'wood') return 'park';
    return null;
  }

  /* Convert Overpass JSON to projected features. proj(lat, lon) → [x, y] mm. */
  function parse(json, proj) {
    const out = { coast: [], water: [], waterways: [], roads: [], rails: [], buildings: [], parks: [] };
    const P = (g) => g.map((n) => proj(n.lat, n.lon));

    for (const el of json.elements || []) {
      const kind = classify(el.tags);
      if (!kind) continue;
      if (el.type === 'way' && el.geometry) {
        const pts = P(el.geometry);
        if (pts.length < 2) continue;
        switch (kind) {
          case 'coast': out.coast.push(pts); break;
          case 'road': out.roads.push({ cls: el.tags.highway, pts }); break;
          case 'rail': out.rails.push(pts); break;
          case 'waterway': out.waterways.push({ cls: el.tags.waterway, pts }); break;
          default:
            if (G.isClosed(pts)) {
              if (kind === 'water') out.water.push([pts]);
              else if (kind === 'building') out.buildings.push([pts]);
              else if (kind === 'park') out.parks.push([pts]);
            }
        }
      } else if (el.type === 'relation' && el.members && el.tags.type === 'multipolygon') {
        const outers = [], inners = [];
        for (const m of el.members) {
          if (m.type !== 'way' || !m.geometry) continue;
          const pts = P(m.geometry.filter(Boolean));
          if (pts.length < 2) continue;
          (m.role === 'inner' ? inners : outers).push(pts);
        }
        const polys = G.assembleMultipolygon(outers, inners);
        if (kind === 'water') out.water.push(...polys);
        else if (kind === 'building') out.buildings.push(...polys);
        else if (kind === 'park') out.parks.push(...polys);
      }
    }
    return out;
  }

  root.LMS.osm = { buildQuery, fetchOverpass, parse, ROAD_WIDTH, WATERWAY_WIDTH };
})(typeof window !== 'undefined' ? window : globalThis);
