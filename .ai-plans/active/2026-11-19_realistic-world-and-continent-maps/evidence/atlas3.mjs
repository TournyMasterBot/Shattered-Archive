// Route atlas v3: the island with a coordinate grid (rooms east and south of the port), zone footprints from the literal-compass walks, the walked routes,
// and the zones placed from the owner's description. Prints a table of every zone's coordinates so they can be discussed in absolute terms.
//   node atlas3.mjs <walks.json> <out.png>
import fs from 'node:fs';
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
const [IN, PNG] = process.argv.slice(2);
const { sessions, titleArea } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const ta = new Map(titleArea);
const V = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1], U: [0, 0], D: [0, 0] };
const areaAt = (st, prev) => { const s = ta.get(st.title); return s ? (s.length === 1 ? s[0] : prev && s.includes(prev) ? prev : null) : null; };
const MAX = 60;

// every literal-compass position within MAX steps of the port, per zone; plus the first entry per walk
const cells = new Map(), entry = new Map();
for (const s of sessions) {
  let pos = null, prev = null, steps = 0, seen = new Set();
  for (const st of s.steps) {
    if (st.title === 'The Arkania Port') { pos = [0, 0]; steps = 0; seen = new Set(); prev = null; continue; }
    if (st.dir === null) { pos = null; continue; }
    if (!pos) continue;
    pos = [pos[0] + V[st.dir][0], pos[1] + V[st.dir][1]];
    if (++steps > MAX) { pos = null; continue; }
    const a = areaAt(st, prev);
    if (!a) continue;
    prev = a;
    (cells.get(a) ?? cells.set(a, new Set()).get(a)).add(pos.join(','));
    if (!seen.has(a)) { seen.add(a); (entry.get(a) ?? entry.set(a, []).get(a)).push(pos); }
  }
}
const q = (v, p) => { const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))]; };
const zones = [...cells].map(([name, set]) => {
  const pts = [...set].map((k) => k.split(',').map(Number));
  const e = entry.get(name) ?? [];
  return { name, rooms: pts.length, x0: q(pts.map((p) => p[0]), 0.05), x1: q(pts.map((p) => p[0]), 0.95), y0: q(pts.map((p) => p[1]), 0.05), y1: q(pts.map((p) => p[1]), 0.95), ex: e.length ? q(e.map((p) => p[0]), 0.5) : null, ey: e.length ? q(e.map((p) => p[1]), 0.5) : null, walks: e.length };
}).filter((z) => z.rooms >= 4 && z.walks >= 2).sort((a, b) => b.rooms - a.rooms);
console.log('zone'.padEnd(32), 'entered at', ' rooms walked', ' footprint x east', ' y south', ' walks');
for (const z of zones) console.log(z.name.padEnd(32), `(${z.ex},${z.ey})`.padEnd(10), String(z.rooms).padStart(8), `   ${z.x0}..${z.x1}`.padEnd(18), `${z.y0}..${z.y1}`.padEnd(10), z.walks);

function route(zone) {
  const found = new Map();
  for (const s of sessions) {
    const st = s.steps;
    for (let i = 0; i < st.length; i += 1) {
      if (st[i].title !== 'The Arkania Port') continue;
      let x = 0, y = 0, prev = null;
      const pts = [[0, 0]], dirs = [];
      for (let k = i + 1; k < st.length && k < i + 1 + MAX; k += 1) {
        if (st[k].dir === null) break;
        x += V[st[k].dir][0]; y += V[st[k].dir][1]; pts.push([x, y]); dirs.push(st[k].dir);
        const a = areaAt(st[k], prev);
        if (a) prev = a;
        if (a === zone) { const key = dirs.join(','); const e = found.get(key) ?? { n: 0, pts: [...pts] }; e.n += 1; found.set(key, e); break; }
      }
    }
  }
  const all = [...found.values()].sort((a, b) => b.n - a.n || a.pts.length - b.pts.length);
  return all[0] ? { ...all[0], walks: [...found.values()].reduce((n, e) => n + e.n, 0) } : null;
}
const TRIPS = [['port to Arkane', 'Arkane', '#c62828'], ['port to the Great Tree', 'Great Tree, The', '#6a1b9a'], ['to Balifore', 'Balifore', '#ef6c00'], ['to Gahboom Hill', 'Gahboom Hill', '#8d6e63'], ['to Rutted Hill (east)', 'Rutted Hill', '#1565c0'], ['to Verminasia Forest', 'Verminasia Forest', '#558b2f'], ['to the Great Forest', 'Great Forest, The', '#2e7d32'], ['to Southlands', 'Southlands of Arkania', '#5d4037']];
const routes = TRIPS.map(([name, zone, color]) => ({ name, color, r: route(zone) })).filter((t) => t.r);
const described = [['Verminasia (north)', 24, -17], ['Mount Levinox (NW)', 6, -14], ['Bloodshackle Fortress', 9, -11], ['Marauders (S / SE)', 11, 18], ['east coast ?', 46, 2]];

const IMG = { x: 230, y: 95, w: 245, h: 250 }, zoom = 6, portImg = [262, 200], sx = 4.0, sy = 3.9;
const P = ([x, y]) => [(portImg[0] + x * sx - IMG.x) * zoom, (portImg[1] + y * sy - IMG.y) * zoom];
const W = IMG.w * zoom, H = IMG.h * zoom, SIDE = 430;
const xmin = Math.ceil((IMG.x - portImg[0]) / sx), xmax = Math.floor((IMG.x + IMG.w - portImg[0]) / sx);
const ymin = Math.ceil((IMG.y - portImg[1]) / sy), ymax = Math.floor((IMG.y + IMG.h - portImg[1]) / sy);
const palette = ['#e53935', '#8e24aa', '#3949ab', '#00897b', '#7cb342', '#fb8c00', '#6d4c41', '#00acc1', '#d81b60', '#5e35b1', '#43a047', '#f4511e', '#039be5', '#c0ca33'];
let svg = `<image href="http://localhost:5000/img/world.webp" x="${-IMG.x * zoom}" y="${-IMG.y * zoom}" width="${600 * zoom}" height="${480 * zoom}"/><rect width="${W}" height="${H}" fill="#fff" fill-opacity=".15"/>`;
// coordinate grid: a line every 5 rooms, heavier every 10, labelled along the edges
for (let x = Math.ceil(xmin / 5) * 5; x <= xmax; x += 5) { const [px] = P([x, 0]); svg += `<line x1="${px}" y1="0" x2="${px}" y2="${H}" stroke="#fff" stroke-opacity="${x % 10 === 0 ? 0.7 : 0.35}" stroke-width="${x === 0 ? 3 : x % 10 === 0 ? 1.6 : 0.8}"/><text x="${px + 3}" y="16" font-size="14" font-family="monospace" font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${x}</text><text x="${px + 3}" y="${H - 6}" font-size="14" font-family="monospace" font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${x}</text>`; }
for (let y = Math.ceil(ymin / 5) * 5; y <= ymax; y += 5) { const [, py] = P([0, y]); svg += `<line x1="0" y1="${py}" x2="${W}" y2="${py}" stroke="#fff" stroke-opacity="${y % 10 === 0 ? 0.7 : 0.35}" stroke-width="${y === 0 ? 3 : y % 10 === 0 ? 1.6 : 0.8}"/><text x="4" y="${py - 3}" font-size="14" font-family="monospace" font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${y}</text><text x="${W - 30}" y="${py - 3}" font-size="14" font-family="monospace" font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${y}</text>`; }
// zone footprints
zones.forEach((z, i) => { const c = palette[i % palette.length]; const [a, b] = P([z.x0 - 0.5, z.y0 - 0.5]); const [d, e] = P([z.x1 + 0.5, z.y1 + 0.5]); svg += `<rect x="${a}" y="${b}" width="${d - a}" height="${e - b}" fill="${c}" fill-opacity=".30" stroke="${c}" stroke-width="2.5"/>`; z.c = c; });
for (const t of routes) { const d = t.r.pts.map((p) => P(p).join(',')).join(' '); svg += `<polyline points="${d}" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" stroke-opacity=".8"/><polyline points="${d}" fill="none" stroke="${t.color}" stroke-width="3" stroke-linejoin="round"/>`; }
const used = [];
const label = (txt, px, py, extra = '') => { let y = py + 5; while (used.some(([ux, uy]) => Math.abs(ux - (px + 12)) < 190 && Math.abs(uy - y) < 18)) y += 18; used.push([px + 12, y]); return `<text x="${px + 12}" y="${y}" font-size="15" font-family="sans-serif" font-weight="bold" fill="#111" stroke="#fff" stroke-width="4.5" paint-order="stroke" ${extra}>${txt}</text>`; };
for (const z of zones) if (z.ex !== null) { const [px, py] = P([z.ex, z.ey]); svg += `<circle cx="${px}" cy="${py}" r="7" fill="#fff" stroke="#000" stroke-width="2.5"/>${label(`${z.name.replace(', The', '')} (${z.ex},${z.ey})`, px, py)}`; }
for (const [n, x, y] of described) { const [px, py] = P([x, y]); svg += `<circle cx="${px}" cy="${py}" r="9" fill="#fff" fill-opacity=".35" stroke="#000" stroke-width="2.5" stroke-dasharray="4 3"/>${label(`${n} (${x},${y})`, px, py, 'font-style="italic"')}`; }
const [ppx, ppy] = P([0, 0]);
svg += `<rect x="${ppx - 10}" y="${ppy - 10}" width="20" height="20" fill="#1565c0" stroke="#000" stroke-width="3"/><text x="${ppx - 16}" y="${ppy - 14}" font-size="17" font-family="sans-serif" font-weight="bold" text-anchor="end" fill="#000" stroke="#fff" stroke-width="5" paint-order="stroke">The Arkania Port (0,0)</text>`;
// side panel: legend
let side = `<rect width="${SIDE}" height="${H}" fill="#fafafa"/><text x="14" y="26" font-size="16" font-family="sans-serif" font-weight="bold">Coordinates: rooms east (x) and south (y) of the port</text><text x="14" y="46" font-size="13" font-family="sans-serif">Literal compass inputs only; up and down count nothing; a warp ends the count; walks end after ${MAX} steps. Grid every 5 rooms.</text>`;
let ly = 76;
side += `<text x="14" y="${ly}" font-size="14" font-family="sans-serif" font-weight="bold">Zone footprints (5th to 95th percentile of rooms walked)</text>`; ly += 8;
zones.forEach((z) => { ly += 20; side += `<rect x="14" y="${ly - 12}" width="22" height="14" fill="${z.c}" fill-opacity=".5" stroke="${z.c}" stroke-width="2"/><text x="44" y="${ly}" font-size="13" font-family="sans-serif">${z.name.replace(', The', '')}  x ${z.x0}..${z.x1}, y ${z.y0}..${z.y1}</text>`; });
ly += 30; side += `<text x="14" y="${ly}" font-size="14" font-family="sans-serif" font-weight="bold">Walked routes (rooms, walks)</text>`;
for (const t of routes) { ly += 20; side += `<line x1="14" y1="${ly - 4}" x2="40" y2="${ly - 4}" stroke="${t.color}" stroke-width="4"/><text x="48" y="${ly}" font-size="13" font-family="sans-serif">${t.name}: ${t.r.pts.length - 1} rooms (${t.r.walks}x)</text>`; }
ly += 30; side += `<circle cx="24" cy="${ly - 4}" r="7" fill="#fff" stroke="#000" stroke-width="2.5"/><text x="40" y="${ly}" font-size="13" font-family="sans-serif">solid dot: median first entry of the zone by your walks</text>`;
ly += 22; side += `<circle cx="24" cy="${ly - 4}" r="7" fill="#fff" fill-opacity=".35" stroke="#000" stroke-width="2.5" stroke-dasharray="3 3"/><text x="40" y="${ly}" font-size="13" font-family="sans-serif" font-style="italic">hollow dot: placed from your description, not walked</text>`;
const total = W + SIDE;
await withPage('http://localhost:5000/maps/world-v2', async (page) => {
  await page.setViewportSize({ width: Math.round(total), height: Math.round(H) });
  await page.setContent(`<body style="margin:0"><svg width="${total}" height="${H}" xmlns="http://www.w3.org/2000/svg"><g>${svg}</g><g transform="translate(${W},0)">${side}</g></svg></body>`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: PNG });
}, { headless: true });
