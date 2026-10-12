# Laser Map Studio

Design layered, laser-cut maps of **any place in the world** and export ready-to-cut SVG files — in the spirit of maker.studio's map maker.

Open `index.html` (or host the folder on GitHub Pages / any static host). No build step, no API keys.

## How it works

1. **Choose area** – search any city/address (OpenStreetMap Nominatim) or use your location, then pan/zoom so the area sits inside the outline.
2. **Shape & size** – rectangle, rounded rectangle, square, circle, hexagon or heart, **or upload your own SVG**; size in millimetres; optional border and raised frame layer.
3. **Features** – water (cut out), streets (engrave or score, with detail level), rivers & canals, railways, parks & forest, buildings (engraved or as a separate raised layer).
4. **Generate** – map data is pulled live from the OpenStreetMap Overpass API, projected (Web Mercator) into millimetres, clipped to the shape and split into layers.
5. **Preview & export** – a "finished look" preview with material themes, a per-layer laser view, and downloads: one SVG per layer, an all-in-one sheet, or a ZIP with everything plus a README.

## Layers (bottom → top)

| # | Layer | Contents |
|---|-------|----------|
| 1 | Base plate | Outline cut; optional engraved water area |
| 2 | Land plate | Outline + water cut out; streets, rivers, parks, (buildings) engraved; railways scored |
| 3 | Buildings | Building footprints cut as raised pieces (optional) |
| 4 | Frame | Raised border ring (optional, needs border > 0) |

Laser colour convention, all units in mm: **red `#FF0000` 0.1 mm = cut**, **blue `#0000FF` 0.1 mm = score**, **black = raster engrave**.

## Custom shapes (SVG upload)

Click **Upload SVG** in the shape grid. The outline is scaled to the width you set (height follows the SVG's proportions) and is saved in your browser for next time (× removes it).

- Supports `path`, `rect`, `circle`, `ellipse`, `polygon`, `polyline`, including curves, arcs and `transform`s.
- **Holes**: subpaths inside one path become holes (e.g. a ring, the counter of an "O"), and shapes filled **white** are cut away from the shapes below them.
- Separate shapes become separate pieces.
- The border is applied around the outline *and* around every hole.
- Not supported: text (convert to paths/outlines first), stroke-only lines, `<use>`, images.

## Worldwide coverage

- Oceans and seas are built from OSM `natural=coastline` lines (land is on the left of a coastline), so coastal cities, islands and fjords work anywhere.
- Lakes, reservoirs and river areas come from `natural=water` (including multipolygon relations with islands).
- Several public Overpass servers are tried in turn if one is busy.

Very large areas (> ~140 × 140 km) are refused; for big regions use "Major roads" and turn buildings off.

## Files

- `js/geometry.js` – clipping, simplification, coastline → land polygons, multipolygon assembly, SVG paths
- `js/shapes.js` – frame shapes (built-in + uploaded)
- `js/svgshape.js` – SVG import: path flattening, transforms, holes
- `js/osm.js` – Overpass query + parsing
- `js/build.js` – turns map features + settings into laser layers
- `js/render.js` – laser SVGs and the finished-look preview
- `js/app.js` – UI
- `vendor/` – Leaflet 1.9.4, polygon-clipping 0.15.7, JSZip 3.10.1 (licences included)

Map data © OpenStreetMap contributors (ODbL). Basemap tiles © CARTO.
