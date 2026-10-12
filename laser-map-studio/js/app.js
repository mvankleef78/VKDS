/* UI wiring: map, overlay, settings, generation, preview and export. */
(function () {
  'use strict';
  const { geom: G, shapes: S, osm: OSM, render: Rn, build } = window.LMS;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'laser-map-studio:settings';

  const state = {
    shape: 'rect',
    placeName: 'map',
    model: null,
    cache: { query: null, json: null },
    previewMode: 'finished',
  };

  /* ---------- settings ---------- */

  const FIELDS = ['width', 'height', 'border', 'water', 'roads', 'detail', 'waterways', 'rails', 'parks', 'buildings',
    'roadScale', 'simplify', 'minArea', 'minBuilding', 'theme'];
  const CHECKS = ['frameLayer', 'engraveWaterOnBase'];

  function readSettings() {
    const num = (id, d) => { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
    return {
      shape: state.shape,
      width: Math.max(20, num('width', 300)),
      height: Math.max(20, num('height', 200)),
      border: Math.max(0, num('border', 0)),
      frameLayer: $('frameLayer').checked,
      water: $('water').value,
      roads: $('roads').value,
      detail: $('detail').value,
      waterways: $('waterways').value,
      rails: $('rails').value,
      parks: $('parks').value,
      buildings: $('buildings').value,
      engraveWaterOnBase: $('engraveWaterOnBase').checked,
      roadScale: Math.max(0.05, num('roadScale', 1)),
      simplify: Math.max(0, num('simplify', 0.1)),
      minArea: Math.max(0, num('minArea', 4)),
      minBuilding: Math.max(0, num('minBuilding', 0.6)),
      theme: $('theme').value,
    };
  }

  function saveSettings() {
    try {
      const s = readSettings();
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (_) { /* storage unavailable */ }
  }

  function loadSettings() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { s = null; }
    if (!s) return;
    if (s.shape && S.SHAPES[s.shape]) state.shape = s.shape;
    for (const id of FIELDS) if (s[id] !== undefined && $(id)) $(id).value = s[id];
    for (const id of CHECKS) if (s[id] !== undefined) $(id).checked = !!s[id];
  }

  /* ---------- map ---------- */

  function initialView() {
    const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/);
    if (m) return { center: [parseFloat(m[1]), parseFloat(m[2])], zoom: parseFloat(m[3]) };
    return { center: [52.3731, 4.8922], zoom: 14 };
  }

  const iv = initialView();
  const map = L.map('map', { zoomSnap: 0.25, zoomDelta: 0.5, worldCopyJump: true }).setView(iv.center, iv.zoom);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  map.on('moveend', () => {
    const c = map.getCenter();
    history.replaceState(null, '', `#${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`);
    updateScale();
  });
  map.on('resize zoomend', drawOverlay);

  /* Pixel rectangle (within the map container) that the shape's bounding box occupies. */
  function overlayRect() {
    const s = readSettings();
    const { W, H } = S.dims(s.shape, s.width, s.height);
    const size = map.getSize();
    const pad = Math.min(48, Math.max(16, Math.min(size.x, size.y) * 0.08));
    const k = Math.min((size.x - pad * 2) / W, (size.y - pad * 2) / H);
    const w = W * k, h = H * k;
    return { left: (size.x - w) / 2, top: (size.y - h) / 2, w, h, k, W, H, cw: size.x, ch: size.y, s };
  }

  function drawOverlay() {
    const o = overlayRect();
    const svg = $('overlay');
    svg.setAttribute('viewBox', `0 0 ${o.cw} ${o.ch}`);
    const toPx = (ring) => ring.map((p) => [o.left + p[0] * o.k, o.top + p[1] * o.k]);
    const outer = toPx(S.ring(o.s.shape, o.W, o.H, 0));
    const border = Math.min(o.s.border, Math.min(o.W, o.H) / 4);
    const inner = border > 0 ? toPx(S.ring(o.s.shape, o.W, o.H, border)) : null;
    const mask = `M0 0H${o.cw}V${o.ch}H0Z` + G.ringsToPath([[outer]]);
    svg.innerHTML =
      `<path d="${mask}" fill="rgba(20,24,32,0.42)" fill-rule="evenodd"/>` +
      `<path d="${G.ringsToPath([[outer]])}" fill="none" stroke="#e4572e" stroke-width="2.5"/>` +
      (inner ? `<path d="${G.ringsToPath([[inner]])}" fill="none" stroke="#e4572e" stroke-width="1.2" stroke-dasharray="6 5" opacity="0.85"/>` : '');
    updateScale();
    updateSizeInfo(o);
  }

  function areaKm2() {
    const o = overlayRect();
    const tl = map.containerPointToLatLng([o.left, o.top]);
    const tr = map.containerPointToLatLng([o.left + o.w, o.top]);
    const bl = map.containerPointToLatLng([o.left, o.top + o.h]);
    return { w: tl.distanceTo(tr) / 1000, h: tl.distanceTo(bl) / 1000, o };
  }

  function updateScale() {
    const { w, h, o } = areaKm2();
    const fmt = (km) => (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(km < 10 ? 2 : 1) + ' km');
    const ratio = Math.round((w * 1e6) / o.W);
    $('scaleBadge').textContent = `${fmt(w)} × ${fmt(h)} · scale 1:${ratio.toLocaleString()}`;
  }

  function updateSizeInfo(o) {
    $('sizeInfo').textContent = `Finished size: ${Math.round(o.W)} × ${Math.round(o.H)} mm`;
    $('heightWrap').style.display = S.SHAPES[o.s.shape].freeHeight ? '' : 'none';
  }

  /* ---------- shape picker ---------- */

  function buildShapeGrid() {
    const grid = $('shapeGrid');
    grid.innerHTML = '';
    for (const [key, def] of Object.entries(S.SHAPES)) {
      const { W, H } = S.dims(key, 100, 66);
      const k = 30 / Math.max(W, H);
      const ring = S.ring(key, W, H, 0).map((p) => [p[0] * k + (36 - W * k) / 2, p[1] * k + (36 - H * k) / 2]);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'shape-btn' + (key === state.shape ? ' active' : '');
      b.title = def.label;
      b.innerHTML = `<svg viewBox="0 0 36 36"><path d="${G.ringsToPath([[ring]])}"/></svg><span>${def.label.replace(' rectangle', '')}</span>`;
      b.onclick = () => { state.shape = key; buildShapeGrid(); drawOverlay(); saveSettings(); };
      grid.appendChild(b);
    }
  }

  /* ---------- search ---------- */

  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('searchInput').value.trim();
    if (!q) return;
    const list = $('searchResults');
    list.innerHTML = '<li class="muted">Searching…</li>';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}&accept-language=${encodeURIComponent(navigator.language || 'en')}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const items = await res.json();
      list.innerHTML = '';
      if (!items.length) { list.innerHTML = '<li class="muted">No places found.</li>'; return; }
      for (const it of items) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = it.display_name;
        btn.onclick = () => {
          const bb = it.boundingbox.map(parseFloat);
          map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 16 });
          state.placeName = it.name || it.display_name.split(',')[0];
          list.innerHTML = '';
        };
        li.appendChild(btn);
        list.appendChild(li);
      }
    } catch (err) {
      list.innerHTML = `<li class="muted">Search failed (${err.message}).</li>`;
    }
  });

  $('locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Geolocation is not available in this browser.', 'error');
    navigator.geolocation.getCurrentPosition(
      (p) => map.setView([p.coords.latitude, p.coords.longitude], 15),
      () => setStatus('Could not get your location.', 'error')
    );
  });

  /* ---------- generation ---------- */

  function setStatus(msg, kind) {
    const el = $('status');
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  const tick = () => new Promise((r) => setTimeout(r, 20));

  function autoDetail(km2) {
    if (km2 < 6) return 'all';
    if (km2 < 200) return 'medium';
    return 'major';
  }

  async function generate() {
    const btn = $('generateBtn');
    const s = readSettings();
    const { w, h, o } = areaKm2();
    const km2 = w * h;
    const detail = s.detail === 'auto' ? autoDetail(km2) : s.detail;

    if (km2 > 20000) {
      setStatus('This area is very large. Zoom in a bit (max ≈ 140 × 140 km) – OpenStreetMap servers will refuse bigger requests.', 'error');
      return;
    }
    if (s.buildings !== 'off' && km2 > 60 &&
        !confirm(`Buildings over ${Math.round(km2)} km² is a lot of data and may be slow or fail. Continue?`)) {
      return setStatus('Cancelled – zoom in or turn buildings off for large areas.');
    }
    if (detail === 'all' && km2 > 50 &&
        !confirm(`"Everything" street detail over ${Math.round(km2)} km² is a lot of data. Continue?`)) {
      return setStatus('Cancelled – pick a lower street detail for large areas.');
    }

    btn.disabled = true;
    try {
      // Leaflet allows panning into neighbouring world copies; OSM data lives in -180..180.
      const c = map.getCenter();
      if (Math.abs(c.lng) > 180) map.setView(c.wrap(), map.getZoom(), { animate: false });
      const z = map.getZoom();
      const origin = map.project(map.containerPointToLatLng([o.left, o.top]), z);
      const proj = (lat, lon) => {
        const p = map.project([lat, lon], z);
        return [(p.x - origin.x) / o.k, (p.y - origin.y) / o.k];
      };
      const mx = o.w * 0.08, my = o.h * 0.08;
      const nw = map.containerPointToLatLng([o.left - mx, o.top - my]);
      const se = map.containerPointToLatLng([o.left + o.w + mx, o.top + o.h + my]);
      const bbox = { s: Math.max(-85, se.lat), w: Math.max(-180, nw.lng), n: Math.min(85, nw.lat), e: Math.min(180, se.lng) };

      const query = OSM.buildQuery(bbox, {
        water: s.water !== 'off', waterways: s.waterways !== 'off', roads: s.roads !== 'off', detail,
        rails: s.rails !== 'off', buildings: s.buildings !== 'off', parks: s.parks !== 'off',
      });

      let json;
      if (state.cache.query === query) json = state.cache.json;
      else {
        json = await OSM.fetchOverpass(query, setStatus);
        state.cache = { query, json };
      }
      setStatus(`Processing ${json.elements.length.toLocaleString()} map features…`);
      await tick();
      const data = OSM.parse(json, proj);
      const model = build(data, s, setStatus);
      await tick();
      model.settings = s;
      state.model = model;
      const st = model.stats;
      setStatus(`Done – ${st.roads} street segments, ${st.water} water areas` +
        (st.buildings ? `, ${st.buildings} buildings` : '') + (st.parks ? `, ${st.parks} parks` : '') +
        `. ${model.layers.length} layers.`, 'ok');
      $$('.tab')[1].disabled = false;
      showView('preview');
      renderPreview();
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  $('generateBtn').addEventListener('click', generate);

  /* ---------- preview & export ---------- */

  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showView(v) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    $('mapView').classList.toggle('active', v === 'map');
    $('previewView').classList.toggle('active', v === 'preview');
    if (v === 'map') setTimeout(() => { map.invalidateSize(); drawOverlay(); }, 0);
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => !t.disabled && showView(t.dataset.view)));

  $$('#previewMode button').forEach((b) => b.addEventListener('click', () => {
    state.previewMode = b.dataset.mode;
    $$('#previewMode button').forEach((x) => x.classList.toggle('active', x === b));
    renderPreview();
  }));

  function renderPreview() {
    const m = state.model;
    if (!m) return;
    const area = $('previewArea');
    if (state.previewMode === 'finished') {
      area.className = 'preview-area finished';
      area.innerHTML = Rn.finishedSvg(m, $('theme').value);
    } else {
      area.className = 'preview-area laser';
      area.innerHTML = m.layers.map((l, i) =>
        `<figure><div class="laser-wrap">${Rn.laserPreviewSvg(m, l)}</div><figcaption>${i + 1}. ${l.name}</figcaption></figure>`).join('');
    }
    const list = $('layerList');
    list.innerHTML = '';
    m.layers.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.innerHTML = `<div><strong>${i + 1}. ${l.name}</strong><small>${l.note}</small></div>`;
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = 'SVG';
      b.onclick = () => download(fileName(`${i + 1}-${l.id}.svg`), Rn.layerSvg(m, l), 'image/svg+xml');
      row.appendChild(b);
      list.appendChild(row);
    });
  }

  const slug = (s) => (s || 'map').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
  const fileName = (suffix) => `${slug(state.placeName)}-${state.shape}-${suffix}`;

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  $('dlSheet').addEventListener('click', () => {
    if (state.model) download(fileName('all-layers.svg'), Rn.sheetSvg(state.model), 'image/svg+xml');
  });

  $('dlZip').addEventListener('click', async () => {
    const m = state.model;
    if (!m) return;
    const zip = new JSZip();
    m.layers.forEach((l, i) => zip.file(`${i + 1}-${l.id}.svg`, Rn.layerSvg(m, l)));
    zip.file('all-layers.svg', Rn.sheetSvg(m));
    zip.file('README.txt', readme(m));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    download(fileName('laser-files.zip'), blob);
  });

  function readme(m) {
    const s = m.settings;
    return [
      'Laser Map Studio export',
      '=======================',
      `Place: ${state.placeName}`,
      `Shape: ${S.SHAPES[s.shape].label}, ${Math.round(m.W)} x ${Math.round(m.H)} mm, border ${m.border} mm`,
      '',
      'Colour convention (all units in mm):',
      '  RED   #FF0000  stroke 0.1 mm  -> vector CUT',
      '  BLUE  #0000FF  stroke 0.1 mm  -> SCORE / light vector engrave',
      '  BLACK #000000  fills/strokes  -> raster ENGRAVE',
      '',
      'Layers, bottom to top:',
      ...m.layers.map((l, i) => `  ${i + 1}. ${l.name} – ${l.note}`),
      '',
      'Tip: cut the base plate from coloured acrylic or painted wood for the water,',
      'and the land plate from 3 mm plywood. Engrave before cutting.',
      '',
      'Map data (c) OpenStreetMap contributors, ODbL – https://www.openstreetmap.org/copyright',
    ].join('\n');
  }

  /* ---------- theme select & misc ---------- */

  for (const [k, t] of Object.entries(Rn.THEMES)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = t.label;
    $('theme').appendChild(o);
  }
  $('theme').addEventListener('change', () => { saveSettings(); renderPreview(); });

  loadSettings();
  buildShapeGrid();
  for (const id of FIELDS.concat(CHECKS)) {
    if (id === 'theme') continue;
    $(id).addEventListener('input', () => { drawOverlay(); saveSettings(); });
  }
  window.addEventListener('resize', drawOverlay);
  drawOverlay();

  // expose for debugging/tests
  window.LMS.app = { state, map, generate, readSettings };
})();
