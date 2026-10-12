/* Turns projected OSM features + user settings into laser layers. */
(function (root) {
  'use strict';
  const G = root.LMS.geom, S = root.LMS.shapes, OSM = root.LMS.osm;

  const cleanPolys = (polys, tol, minArea) => {
    const out = [];
    for (const poly of polys) {
      const outer = G.simplifyRing(poly[0], tol);
      if (!outer || Math.abs(G.ringArea(outer)) < minArea) continue;
      const holes = [];
      for (let i = 1; i < poly.length; i++) {
        const h = G.simplifyRing(poly[i], tol);
        if (h && Math.abs(G.ringArea(h)) >= minArea) holes.push(h);
      }
      out.push([outer, ...holes]);
    }
    return out;
  };

  /* Drop polygons smaller than minArea and fill holes smaller than minArea. */
  const pruneMulti = (multi, minArea) =>
    multi
      .filter((p) => G.polygonArea(p) >= minArea)
      .map((p) => [p[0], ...p.slice(1).filter((h) => Math.abs(G.ringArea(h)) >= minArea)]);

  function clipLines(items, clipper, tol) {
    const out = [];
    for (const it of items) {
      const pts = G.simplify(it.pts, tol);
      for (const piece of clipper(pts)) out.push({ cls: it.cls, pts: piece });
    }
    return out;
  }

  /* Group lines by stroke width for compact SVG output. */
  function groupByWidth(lines, widthOf) {
    const groups = new Map();
    for (const l of lines) {
      const w = Math.round(widthOf(l.cls) * 100) / 100;
      if (!groups.has(w)) groups.set(w, []);
      groups.get(w).push(l.pts);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([width, lines]) => ({ width, lines }));
  }

  /* Raised road layer: which classes, and their full width in mm at scale 1. */
  const RAISED_CLASSES = {
    major: ['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link'],
    secondary: ['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'],
    tertiary: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'],
  };
  const RAISED_WIDTH = { motorway: 3.0, trunk: 2.8, primary: 2.4, secondary: 2.0, tertiary: 1.6 };
  const raisedWidth = (cls) => RAISED_WIDTH[cls] || (/_link$/.test(cls) ? 1.4 : 1.6);

  /* data: output of LMS.osm.parse; s: settings. */
  function build(data, s, onStatus) {
    const { W, H } = S.dims(s.shape, s.width, s.height);
    const border = Math.max(0, Math.min(s.border, Math.min(W, H) / 4));
    const outerGeom = S.geom(s.shape, W, H, 0);
    const innerGeom = border > 0 ? S.geom(s.shape, W, H, border) : outerGeom;
    if (!innerGeom.length) throw new Error('The border is too wide for this shape – nothing is left inside it.');
    const tol = s.simplify;
    const minArea = s.minArea;

    onStatus && onStatus('Building coastline and water…');
    // Coastline: work on a rect a little larger than the shape.
    const R = { x0: -2, y0: -2, x1: W + 2, y1: H + 2 };
    const rectPoly = [[[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]]];
    let sea = [];
    if (data.coast.length) {
      const chains = G.stitch(data.coast, false).map((c) => (G.isClosed(c) ? G.simplifyRing(c, tol) || c : G.simplify(c, tol)));
      const res = G.coastlineToLand(chains, R);
      const land = res.rings.map((r) => [r]).concat(res.islands.map((r) => [r]));
      if (res.crossing || res.islands.length) sea = G.difference(rectPoly, G.union(land));
    }

    let water = [];
    if (s.water !== 'off') {
      const inland = cleanPolys(data.water, tol, minArea * 0.25);
      const allWater = G.union(inland.concat(sea));
      water = pruneMulti(G.intersect(allWater, innerGeom), minArea);
    }

    const landPlate = water.length
      ? G.difference(outerGeom, water).filter((p, i, arr) => arr.length === 1 || G.polygonArea(p) >= minArea)
      : outerGeom;

    onStatus && onStatus('Clipping streets…');
    const clipper = G.makeLineClipper(innerGeom);
    let roads = s.roads !== 'off' ? clipLines(data.roads, clipper, tol) : [];
    let raised = [];
    const raisedSet = new Set(RAISED_CLASSES[s.raisedRoads] || []);
    if (raisedSet.size) {
      onStatus && onStatus('Building raised road network…');
      const main = data.roads.filter((r) => raisedSet.has(r.cls));
      roads = roads.filter((r) => !raisedSet.has(r.cls)); // not engraved underneath the raised layer
      const scale = s.raisedScale > 0 ? s.raisedScale : 1;
      const items = [];
      for (const r of main) {
        for (const piece of clipper(G.simplify(r.pts, Math.max(tol, 0.15)))) items.push({ pts: piece, w: raisedWidth(r.cls) * scale });
      }
      raised = G.intersect(G.bufferLines(items), innerGeom);
    }
    const waterways = s.waterways !== 'off' ? clipLines(data.waterways, clipper, tol) : [];
    const rails = s.rails !== 'off' ? clipLines(data.rails.map((pts) => ({ cls: 'rail', pts })), clipper, tol) : [];

    onStatus && onStatus('Processing buildings and parks…');
    let buildings = [];
    if (s.buildings !== 'off') {
      buildings = G.clipPolygonsToGeom(cleanPolys(data.buildings, Math.min(tol, 0.05), s.minBuilding), innerGeom)
        .filter((p) => G.polygonArea(p) >= s.minBuilding);
    }
    let parks = [];
    if (s.parks !== 'off') {
      parks = G.intersect(G.union(cleanPolys(data.parks, tol, minArea)), innerGeom);
      if (water.length) parks = G.difference(parks, water);
      parks = pruneMulti(parks, minArea);
    }

    /* ----- layers ----- */
    const rw = (cls) => (OSM.ROAD_WIDTH[cls] || 0.3) * s.roadScale;
    const ww = (cls) => (OSM.WATERWAY_WIDTH[cls] || 0.3) * s.roadScale;
    const layers = [];

    const base = { id: 'base', name: 'Base plate', note: 'Bottom layer – shows through where water is cut out', items: [] };
    base.items.push({ op: 'cut', polys: outerGeom });
    if (s.engraveWaterOnBase && water.length) base.items.push({ op: 'engrave', role: 'water', polys: water });
    layers.push(base);

    const land = { id: 'land', name: 'Land plate', note: 'Water cut out, streets engraved', items: [] };
    if (parks.length) land.items.push({ op: 'engrave', role: 'park', polys: parks });
    if (s.buildings === 'engrave' && buildings.length) land.items.push({ op: 'engrave', role: 'building', polys: buildings });
    if (waterways.length) {
      for (const g of groupByWidth(waterways, ww)) land.items.push({ op: 'engrave', role: 'waterway', lines: g.lines, width: g.width });
    }
    if (roads.length) {
      for (const g of groupByWidth(roads, rw)) {
        land.items.push({ op: s.roads === 'score' ? 'score' : 'engrave', role: 'road', lines: g.lines, width: g.width });
      }
    }
    if (rails.length) land.items.push({ op: 'score', role: 'rail', lines: rails.map((r) => r.pts), width: 0.2 });
    land.items.push({ op: 'cut', polys: landPlate });
    layers.push(land);

    if (s.buildings === 'raised' && buildings.length) {
      layers.push({ id: 'buildings', name: 'Buildings', note: 'Glue on top of the land plate', items: [{ op: 'cut', role: 'building', polys: buildings }] });
    }

    const frameRing = s.frameLayer && border > 0 ? G.difference(outerGeom, innerGeom) : [];
    if (raised.length) {
      // Joined to the frame the whole network is one sturdy piece; tiny enclosed slivers are filled in.
      let net = frameRing.length ? G.union(raised.concat(frameRing)) : raised;
      net = net
        .filter((p) => frameRing.length || G.polygonArea(p) >= 1)
        .map((p) => [p[0], ...p.slice(1).filter((h) => Math.abs(G.ringArea(h)) >= 2)]);
      layers.push({
        id: 'roads',
        name: frameRing.length ? 'Raised roads + frame' : 'Raised roads',
        note: frameRing.length ? 'Main roads and frame in one piece, glue on top' : 'Main roads, glue on top of the land plate',
        items: [{ op: 'cut', role: 'raised', polys: net }],
      });
    } else if (frameRing.length) {
      layers.push({ id: 'frame', name: 'Frame', note: 'Raised border on top', items: [{ op: 'cut', polys: frameRing }] });
    }

    return {
      W, H, outerGeom, innerGeom, border, layers,
      stats: {
        water: water.length, roads: roads.length, raised: raised.length, buildings: buildings.length, parks: parks.length,
        waterways: waterways.length, rails: rails.length, landPieces: landPlate.length,
      },
    };
  }

  root.LMS.build = build;
})(typeof window !== 'undefined' ? window : globalThis);
