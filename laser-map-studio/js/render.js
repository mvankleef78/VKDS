/* SVG output: laser-ready files and a "finished piece" preview. */
(function (root) {
  'use strict';
  const G = root.LMS.geom;

  const LASER = { cut: '#FF0000', score: '#0000FF', engrave: '#000000' };
  const HAIRLINE = 0.1;

  const THEMES = {
    birch:  { label: 'Birch + blue acrylic', base: '#3f7fb3', baseEngrave: '#2f6a9a', land: '#ead7b2', landEdge: '#c9ab7c', engrave: '#9b7a50', park: '#d9c194', waterway: '#5a8db8', building: '#f4e6ca', buildingEngrave: '#b7966a', frame: '#dfc699' },
    walnut: { label: 'Walnut + white',       base: '#f2efe8', baseEngrave: '#dcd6c8', land: '#6e4b33', landEdge: '#4a3021', engrave: '#2f1f14', park: '#5d3e2a', waterway: '#d9d3c4', building: '#8a6447', buildingEngrave: '#3b281b', frame: '#5b3c27' },
    noir:   { label: 'Black + gold',         base: '#c8a14a', baseEngrave: '#a8842f', land: '#232326', landEdge: '#0e0e10', engrave: '#6a6a72', park: '#2e2e33', waterway: '#b8913c', building: '#34343a', buildingEngrave: '#55555c', frame: '#18181b' },
    mint:   { label: 'Plywood + mint',       base: '#9fd8c8', baseEngrave: '#7cc3b0', land: '#e3c9a0', landEdge: '#bb9a6b', engrave: '#8d6a40', park: '#cfb486', waterway: '#7cc3b0', building: '#efdcbc', buildingEngrave: '#a7845a', frame: '#d4b98c' },
  };

  function itemSvg(it, laser, theme, layerId) {
    if (it.polys) {
      const d = G.ringsToPath(it.polys);
      if (!d) return '';
      if (laser) {
        return it.op === 'engrave'
          ? `<path d="${d}" fill="${LASER.engrave}" fill-rule="evenodd" stroke="none"/>`
          : `<path d="${d}" fill="none" fill-rule="evenodd" stroke="${it.op === 'cut' ? LASER.cut : LASER.score}" stroke-width="${HAIRLINE}"/>`;
      }
      if (it.op === 'cut') return ''; // plates are drawn separately in preview
      const fill = it.role === 'water' ? theme.baseEngrave : it.role === 'park' ? theme.park : it.role === 'building' ? theme.buildingEngrave : theme.engrave;
      return `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`;
    }
    if (it.lines) {
      const d = G.linesToPath(it.lines);
      if (!d) return '';
      if (laser) {
        const color = it.op === 'score' ? LASER.score : LASER.engrave;
        const w = it.op === 'score' ? HAIRLINE : it.width;
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      const color = it.role === 'waterway' ? theme.waterway : theme.engrave;
      const w = it.op === 'score' ? Math.max(0.15, it.width * 0.6) : it.width;
      const dash = it.role === 'rail' ? ' stroke-dasharray="0.8 0.5"' : '';
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    }
    return '';
  }

  const header = (w, h, vb) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${vb}">`;

  /* One laser file per layer. */
  function layerSvg(model, layer) {
    const { W, H } = model;
    const body = layer.items.map((it) => itemSvg(it, true)).join('\n');
    return `${header(r2(W), r2(H), `0 0 ${r2(W)} ${r2(H)}`)}\n<title>${layer.name}</title>\n<g id="${layer.id}">\n${body}\n</g>\n</svg>\n`;
  }

  /* All layers next to each other on one sheet. */
  function sheetSvg(model, gap) {
    gap = gap == null ? 5 : gap;
    const { W, H, layers } = model;
    const total = layers.length * W + (layers.length - 1) * gap;
    const groups = layers.map((l, i) =>
      `<g id="${l.id}" transform="translate(${r2(i * (W + gap))} 0)">\n${l.items.map((it) => itemSvg(it, true)).join('\n')}\n</g>`
    ).join('\n');
    return `${header(r2(total), r2(H), `0 0 ${r2(total)} ${r2(H)}`)}\n${groups}\n</svg>\n`;
  }

  /* Laser view for on-screen preview (same as files, but scaled to fit). */
  function laserPreviewSvg(model, layer) {
    const { W, H } = model;
    const body = layer.items.map((it) => itemSvg(it, true)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${r2(W + 2)} ${r2(H + 2)}" class="laser-svg"><rect x="-1" y="-1" width="${r2(W + 2)}" height="${r2(H + 2)}" fill="#fff"/>${body}</svg>`;
  }

  /* Stacked, coloured preview of the finished piece. */
  function finishedSvg(model, themeKey) {
    const t = THEMES[themeKey] || THEMES.birch;
    const { W, H, layers } = model;
    const sh = Math.max(W, H) / 250; // shadow scale
    const pad = sh * 6;
    const defs = `<defs><filter id="lift" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="${r2(sh * 0.5)}" dy="${r2(sh * 0.9)}" stdDeviation="${r2(sh * 0.7)}" flood-color="#000" flood-opacity="0.45"/></filter>` +
      `<filter id="lift2" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="${r2(sh * 0.3)}" dy="${r2(sh * 0.5)}" stdDeviation="${r2(sh * 0.4)}" flood-color="#000" flood-opacity="0.35"/></filter></defs>`;
    let out = '';
    for (const layer of layers) {
      const plate = layer.items.find((it) => it.op === 'cut' && it.role !== 'building');
      const rest = layer.items.filter((it) => it !== plate);
      if (layer.id === 'base') {
        out += `<path d="${G.ringsToPath(plate.polys)}" fill="${t.base}" fill-rule="evenodd" filter="url(#lift)"/>`;
        out += rest.map((it) => itemSvg(it, false, t)).join('');
      } else if (layer.id === 'land') {
        out += `<g><path d="${G.ringsToPath(plate.polys)}" fill="${t.land}" fill-rule="evenodd" stroke="${t.landEdge}" stroke-width="${r2(sh * 0.25)}" filter="url(#lift)"/>`;
        out += rest.map((it) => itemSvg(it, false, t)).join('') + '</g>';
      } else if (layer.id === 'buildings') {
        out += `<path d="${G.ringsToPath(layer.items[0].polys)}" fill="${t.building}" fill-rule="evenodd" filter="url(#lift2)"/>`;
      } else if (layer.id === 'frame') {
        out += `<path d="${G.ringsToPath(plate.polys)}" fill="${t.frame}" fill-rule="evenodd" stroke="${t.landEdge}" stroke-width="${r2(sh * 0.25)}" filter="url(#lift)"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(-pad)} ${r2(-pad)} ${r2(W + pad * 2)} ${r2(H + pad * 2)}" class="finished-svg">${defs}${out}</svg>`;
  }

  const r2 = (n) => Math.round(n * 100) / 100;

  root.LMS.render = { THEMES, layerSvg, sheetSvg, laserPreviewSvg, finishedSvg, LASER };
})(typeof window !== 'undefined' ? window : globalThis);
