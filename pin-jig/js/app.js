/* UI wiring: inputs -> outline -> layout -> previews and downloads. */
(function () {
  const { geom, trace, model, mesh, layout } = window.PJ;
  const $ = (id) => document.getElementById(id);
  const num = (id) => parseFloat($(id).value);
  const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);

  const TRACE_SIZE = 1600; // long side of the bitmap that gets traced
  const state = { source: 'image', tpl: null, traced: null, model: null, art: null, current: null };

  // ---------- file helpers ----------

  /** Physical DPI stored in a PNG (pHYs) or JPEG (JFIF), or null. */
  function readDpi(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b[0] === 0x89 && b[1] === 0x50) {
      for (let p = 8; p + 8 <= b.length;) {
        const len = dv.getUint32(p);
        const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
        if (type === 'pHYs' && b[p + 16] === 1) return dv.getUint32(p + 8) * 0.0254;
        if (type === 'IDAT') break;
        p += 12 + len;
      }
    } else if (b[0] === 0xff && b[1] === 0xd8) {
      for (let p = 2; p + 4 < b.length;) {
        if (b[p] !== 0xff) break;
        const marker = b[p + 1], len = dv.getUint16(p + 2);
        if (marker === 0xe0 && String.fromCharCode(...b.subarray(p + 4, p + 8)) === 'JFIF') {
          const units = b[p + 11], dens = dv.getUint16(p + 12);
          if (units === 1) return dens;
          if (units === 2) return dens * 2.54;
          return null;
        }
        if (marker === 0xda) break;
        p += 2 + len;
      }
    }
    return null;
  }

  async function loadImage(blob, name) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { name, blob, url, img, w: img.naturalWidth, h: img.naturalHeight, dpi: readDpi(bytes) };
  }

  function rasterize(img, longSide) {
    const s = longSide / Math.max(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- inputs ----------

  function traceOptions() {
    const t = num('threshold');
    return { mode: $('maskMode').value, alphaThreshold: t, colorTolerance: t * 0.75 };
  }

  async function setTemplate(blob, name) {
    state.tpl = await loadImage(blob, name);
    state.tpl.raster = rasterize(state.tpl.img, TRACE_SIZE);
    retrace();
  }

  function retrace() {
    if (!state.tpl) return;
    state.traced = trace.traceOutline(state.tpl.raster, traceOptions());
    update();
  }

  async function setArtwork(file) {
    if (!file) { state.art = null; update(); return; }
    const art = await loadImage(file, file.name);
    const r = rasterize(art.img, 1200);
    const box = trace.contentBox(r, { mode: 'auto', alphaThreshold: 8, colorTolerance: 24 });
    art.box = { u0: box.x0 / r.width, v0: box.y0 / r.height, u1: box.x1 / r.width, v1: box.y1 / r.height };
    state.art = art;
    const contentPx = (art.box.u1 - art.box.u0) * art.w;
    // Use the file's DPI when it looks like a real print size (e.g. a 300 dpi export
    // of the pin at its final width); otherwise fall back to the pin width.
    const dpiWidth = art.dpi >= 150 ? (contentPx * 25.4) / art.dpi : 0;
    const o = computeOutline();
    const plausible = dpiWidth && (!o || dpiWidth <= o.w * 1.05);
    $('artWidth').value = plausible ? fmt(dpiWidth) : '';
    art.note = dpiWidth && !plausible ? `The file's ${Math.round(art.dpi)} dpi would make it ${fmt(dpiWidth)} mm wide, so the pin width is used instead.` : '';
    update();
  }

  async function setModel(file) {
    state.model = null;
    state.modelError = null;
    try {
      const fp = await model.loadFootprint(file);
      state.model = { name: file.name, polys: fp.polys, items: fp.items };
    } catch (err) {
      state.modelError = err.message || String(err);
    }
    update();
  }

  // ---------- core computation ----------

  function computeOutline() {
    if (state.source === 'image') {
      if (!state.traced || !state.traced.polys.length) return null;
      const pinW = num('pinWidth');
      if (!(pinW > 0)) return null;
      let polys = state.traced.polys;
      let b = geom.bbox(polys);
      let k = pinW / b.w;
      const minA = num('minIsland') || 0;
      const kept = polys.filter((p) => Math.abs(geom.signedArea(p)) * k * k >= minA);
      if (kept.length && kept.length < polys.length) {
        polys = kept;
        b = geom.bbox(polys);
        k = pinW / b.w;
      }
      const outline = polys.map((p) => geom.ccw(p.map(([x, y]) => [(x - b.cx) * k, -(y - b.cy) * k])));
      return { outline, w: pinW, h: b.h * k, k, centerPx: [b.cx, b.cy], boxPx: b, islands: polys.length };
    }
    if (!state.model) return null;
    const b = geom.bbox(state.model.polys);
    return { outline: state.model.polys, w: b.w, h: b.h, islands: state.model.polys.length };
  }

  /** Artwork rectangle relative to the pin centre (mm, y down). */
  function artworkRect(o) {
    const nx = num('nudgeX') || 0, ny = num('nudgeY') || 0;
    let art = state.art;
    if (!art && state.source === 'image' && state.tpl && o.boxPx) {
      const t = state.tpl, r = t.raster;
      art = { ...t, box: { u0: o.boxPx.x0 / r.width, v0: o.boxPx.y0 / r.height, u1: o.boxPx.x1 / r.width, v1: o.boxPx.y1 / r.height }, isTemplate: true };
    }
    if (!art) return null;
    if ($('artMode').value === 'register' && state.source === 'image' && o.k && state.tpl) {
      const r = state.tpl.raster;
      return { art, x: -o.centerPx[0] * o.k + nx, y: -o.centerPx[1] * o.k + ny, w: r.width * o.k, h: r.height * o.k };
    }
    const width = art.isTemplate ? o.w : num('artWidth') || o.w;
    const ka = width / ((art.box.u1 - art.box.u0) * art.w);
    const cx = ((art.box.u0 + art.box.u1) / 2) * art.w, cy = ((art.box.v0 + art.box.v1) / 2) * art.h;
    return { art, x: -cx * ka + nx, y: -cy * ka + ny, w: art.w * ka, h: art.h * ka };
  }

  function readJig() {
    return {
      width: num('jigW'), height: num('jigH'), thickness: num('jigT'), depth: num('pocketDepth'),
      chamfer: num('chamfer') || 0, minWall: num('minWall') || 0, clearance: num('clearance') || 0,
    };
  }

  function update() {
    const issues = [];
    const jig = readJig();
    const jigCount = +$('jigCount').value;
    if (!(jig.width > 0 && jig.height > 0 && jig.thickness > 0)) issues.push({ level: 'error', text: 'Jig size must be positive.' });
    if (!(jig.depth > 0 && jig.depth < jig.thickness)) issues.push({ level: 'error', text: 'Pocket depth must be between 0 and the jig thickness.' });

    const o = computeOutline();
    let pocket = [], placed = { pockets: [], centers: [], issues: [] }, rect = null;
    if (o) {
      pocket = geom.unionOuter(geom.offset(o.outline, jig.clearance).map((p) => geom.simplifyClosed(p, 0.01)));
      const pb = geom.bbox(pocket);
      if ($('autoFit').checked) {
        const fit = layout.autoFit(jig, { w: o.w, h: o.h }, { w: pb.w, h: pb.h }, num('gap') || 0, jig.minWall);
        $('cols').value = fit.cols; $('rows').value = fit.rows; $('sx').value = fit.sx; $('sy').value = fit.sy;
      }
      const grid = { cols: Math.max(1, Math.round(num('cols')) || 1), rows: Math.max(1, Math.round(num('rows')) || 1), sx: num('sx') || 0, sy: num('sy') || 0 };
      if (jig.width > 0 && jig.height > 0) placed = layout.placePockets(jig, grid, pocket);
      issues.push(...placed.issues);
      rect = artworkRect(o);
      $('pinInfo').textContent =
        `Pin ${fmt(o.w)} × ${fmt(o.h)} mm · pocket ${fmt(pb.w)} × ${fmt(pb.h)} mm` +
        (state.source === 'image' ? ` · detected by ${state.traced.mode === 'alpha' ? 'transparency' : 'background colour'}` : '') +
        (o.islands > 1 ? ` · ${o.islands} separate parts` : '');
      if (state.source === 'model' && state.model.items > 1) {
        issues.push({ level: 'warn', text: `The 3MF has ${state.model.items} objects on the plate; all of them are combined into one footprint. Export a single pin if that is not intended.` });
      }
      if (rect && !rect.art.isTemplate) {
        const b = rect.art.box, s = rect.w / rect.art.w;
        const aw = (b.u1 - b.u0) * rect.art.w * s, ah = (b.v1 - b.v0) * rect.art.h * s;
        if (aw > o.w * 1.02 || ah > o.h * 1.02) {
          issues.push({ level: 'warn', text: `The artwork (${fmt(aw)} × ${fmt(ah)} mm) is larger than the pin (${fmt(o.w)} × ${fmt(o.h)} mm). Lower the artwork width.` });
        }
      }
      if (rect && state.art && $('artMode').value === 'register') {
        const r = state.tpl ? state.tpl.raster : null;
        if (!r || state.source !== 'image') issues.push({ level: 'warn', text: '"Same canvas" needs an outline traced from an image; the artwork is centred instead.' });
        else if (Math.abs(state.art.w / state.art.h - r.width / r.height) > 0.01 * (r.width / r.height)) {
          issues.push({ level: 'warn', text: 'The artwork canvas has a different shape than the pin image, so "same canvas" placement will stretch it. Use "Centred on pin" instead.' });
        }
      }
    } else {
      $('pinInfo').textContent = state.source === 'image'
        ? (state.tpl ? 'No shape found. Try another detection mode or threshold.' : '')
        : (state.modelError ? '' : '');
      if (state.source === 'model' && state.modelError) issues.push({ level: 'error', text: state.modelError });
    }

    const hasError = issues.some((i) => i.level === 'error');
    const perJig = placed.centers.length;
    $('count').textContent = o ? `${perJig} per jig · ${perJig * jigCount} per plate` : '–';
    $('issues').innerHTML = issues.length
      ? issues.map((i) => `<li class="${i.level}">${i.text}</li>`).join('')
      : o ? '<li class="ok">Layout fits ✓</li>' : '';
    $('artHint').textContent = rect
      ? `Artwork ${fmt(rect.w)} × ${fmt(rect.h)} mm canvas${rect.art.isTemplate ? ' (using the pin image)' : ''}. ${rect.art.note || ''}`
      : state.source === 'model' ? 'Upload artwork to create the UV layout.' : '';

    state.current = o ? { o, jig, jigCount, pocket, placed, rect, hasError } : null;
    $('dlJig').disabled = !o || hasError;
    $('dlPockets').disabled = !o || hasError;
    $('dlPng').disabled = $('dlSvg').disabled = !o || !rect || hasError;
    renderBed(jig, jigCount, placed, rect, hasError);
    renderPin(o, pocket, rect);
  }

  // ---------- previews ----------

  function renderBed(jig, jigCount, placed, rect, hasError) {
    const svg = $('bedSvg');
    if (!(jig.width > 0 && jig.height > 0)) { svg.innerHTML = ''; return; }
    const W = jig.width * jigCount, H = jig.height, m = 3;
    svg.setAttribute('viewBox', `${-m} ${-m} ${W + 2 * m} ${H + 2 * m + 5}`);
    $('bedSize').textContent = `${fmt(W)} × ${fmt(H)} mm`;
    const outline = mesh.jigOutline(jig.width, jig.height, jig.chamfer);
    const bedPockets = placed.pockets.length ? placed.pockets : [];
    let out = '';
    for (let j = 0; j < jigCount; j++) {
      const toBed = (polys) => polys.map((p) => p.map((pt) => layout.toBed(jig, j, pt)));
      out += `<path class="jig-shape" d="${layout.pathD(toBed([outline]))}"/>`;
      if (bedPockets.length) out += `<path class="pocket-shape${hasError ? ' bad' : ''}" fill-rule="nonzero" d="${layout.pathD(toBed(bedPockets))}"/>`;
      out += `<text class="dim" x="${j * jig.width + jig.width / 2}" y="${H + 4.5}" text-anchor="middle">Jig ${j + 1}</text>`;
    }
    if (rect && $('showArt').checked) {
      out += `<clipPath id="bedClip"><rect width="${W}" height="${H}"/></clipPath><g clip-path="url(#bedClip)">`;
      for (const p of layout.artworkPlacements(jig, placed.centers, jigCount, rect)) {
        out += `<image href="${rect.art.url}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="none"/>`;
      }
      out += '</g>';
    }
    svg.innerHTML = out;
  }

  function renderPin(o, pocket, rect) {
    const svg = $('pinSvg');
    if (!o) { svg.removeAttribute('viewBox'); svg.innerHTML = ''; return; }
    const flip = (polys) => polys.map((p) => p.map(([x, y]) => [x, -y]));
    const b = geom.bbox(flip(pocket));
    const m = Math.max(b.w, b.h) * 0.08;
    svg.setAttribute('viewBox', `${b.x0 - m} ${b.y0 - m} ${b.w + 2 * m} ${b.h + 2 * m}`);
    let out = '';
    if (state.source === 'image' && state.tpl && (!rect || !rect.art.isTemplate)) {
      const r = state.tpl.raster;
      out += `<image href="${state.tpl.url}" opacity="0.35" x="${-o.centerPx[0] * o.k}" y="${-o.centerPx[1] * o.k}" width="${r.width * o.k}" height="${r.height * o.k}" preserveAspectRatio="none"/>`;
    }
    if (rect) out += `<image href="${rect.art.url}" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" preserveAspectRatio="none"/>`;
    out += `<path class="pin-outline" d="${layout.pathD(flip(o.outline))}"/>`;
    out += `<path class="pin-pocket" d="${layout.pathD(flip(pocket))}"/>`;
    svg.innerHTML = out;
  }

  // ---------- downloads ----------

  const baseName = () => {
    const c = state.current;
    const src = state.source === 'image' ? state.tpl && state.tpl.name : state.model && state.model.name;
    const stem = (src || 'pin').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40);
    return `${stem}_${c.placed.centers.length}up`;
  };

  $('dlJig').addEventListener('click', () => {
    const c = state.current;
    const tris = mesh.buildJigMesh({ ...c.jig, pockets: c.placed.pockets });
    const stl = mesh.toBinarySTL(tris, `pin jig ${c.jig.width}x${c.jig.height}x${c.jig.thickness}mm`);
    download(new Blob([stl], { type: 'model/stl' }), `${baseName()}_jig_${c.jig.width}x${c.jig.height}.stl`);
  });

  const layoutData = () => {
    const c = state.current;
    const size = { w: c.jig.width * c.jigCount, h: c.jig.height };
    return { c, size, placements: layout.artworkPlacements(c.jig, c.placed.centers, c.jigCount, c.rect) };
  };

  $('dlPng').addEventListener('click', async () => {
    const { c, size, placements } = layoutData();
    const dpi = +$('dpi').value;
    const btn = $('dlPng');
    btn.disabled = true;
    try {
      const blob = await layout.renderLayoutPNG(c.rect.art.img, placements, size, dpi);
      download(blob, `${baseName()}_uv-layout_${size.w}x${size.h}mm_${dpi}dpi.png`);
    } finally {
      btn.disabled = false;
    }
  });

  $('dlSvg').addEventListener('click', async () => {
    const { c, size, placements } = layoutData();
    const href = await blobToDataURL(c.rect.art.blob);
    const svg = layout.layoutSVG(href, placements, size);
    download(new Blob([svg], { type: 'image/svg+xml' }), `${baseName()}_uv-layout_${size.w}x${size.h}mm.svg`);
  });

  $('dlPockets').addEventListener('click', () => {
    const c = state.current;
    const svg = layout.pocketsSVG(c.jig, c.placed.pockets);
    download(new Blob([svg], { type: 'image/svg+xml' }), `${baseName()}_pockets.svg`);
  });

  // ---------- events ----------

  let raf = 0, traceTimer = 0;
  const scheduleUpdate = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
  const scheduleTrace = () => { clearTimeout(traceTimer); traceTimer = setTimeout(retrace, 120); };

  const form = $('controls');
  form.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'threshold') $('thresholdOut').textContent = e.target.value;
    if (['cols', 'rows', 'sx', 'sy'].includes(id)) $('autoFit').checked = false;
    if (id === 'threshold' || id === 'maskMode') return scheduleTrace();
    if (e.target.type === 'file') return;
    if (e.target.name === 'source') {
      state.source = e.target.value;
      document.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== state.source; });
    }
    scheduleUpdate();
  });
  $('showArt').addEventListener('change', scheduleUpdate);

  const guard = (fn) => async (e) => {
    const f = e.target.files[0];
    try { await fn(f); } catch (err) { alert(`Could not read ${f ? f.name : 'file'}: ${err.message || err}`); }
  };
  $('tplFile').addEventListener('change', guard((f) => f && setTemplate(f, f.name)));
  $('modelFile').addEventListener('change', guard((f) => f && setModel(f)));
  $('artFile').addEventListener('change', guard((f) => setArtwork(f)));

  // Restore control state the browser may have kept across a reload.
  state.source = form.querySelector('input[name="source"]:checked').value;
  document.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== state.source; });
  $('thresholdOut').textContent = $('threshold').value;
  update();
})();
