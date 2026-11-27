// Route map: every port-anchored walk dead-reckoned (1 room = 1 step in the direction typed) and drawn as a faint line, so the busy routes show dark.
// Left: the pure dead-reckoned plane. Right: the same, stretched onto the realistic Arkania island from world.webp.
//   node routemap.mjs <walks.json> <out.png>
import fs from 'node:fs';
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
const [IN, PNG] = process.argv.slice(2);
const { sessions, titleArea } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const ta = new Map(titleArea);
const V = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1], U: [0, 0], D: [0, 0] };
const COLORS = { 'Arkane Coast': '#1565c0', 'Kender Forest, The': '#2e7d32', Arkane: '#c62828', 'Great Tree, The': '#6a1b9a', Balifore: '#ef6c00', 'Enchanted Forest': '#00897b', 'Gahboom Hill': '#8d6e63', Verminasia: '#ad1457', 'Verminasia Forest': '#558b2f', 'Verminasia Palace': '#4527a0' };
const lines = [];
const med = new Map();
for (const s of sessions) {
  let pos = null, prev = null, cur = null;
  for (const st of s.steps) {
    if (st.title === 'The Arkania Port') { pos = [0, 0]; cur = [[0, 0]]; lines.push(cur); }
    else if (st.dir === null) { pos = null; cur = null; }
    else if (pos) { pos = [pos[0] + V[st.dir][0], pos[1] + V[st.dir][1]]; cur?.push(pos); }
    const set = ta.get(st.title);
    const area = set ? (set.length === 1 ? set[0] : prev && set.includes(prev) ? prev : set[0]) : null;
    if (area) prev = area;
    if (pos && area) { const l = med.get(area) ?? []; l.push(pos); med.set(area, l); }
  }
}
const median = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const marks = [...med].filter(([a, l]) => l.length >= 8 && !/Occultist|Mired|Blazing|Winterhaven|Stars/.test(a)).map(([a, l]) => ({ a, n: l.length, x: median(l.map((p) => p[0])), y: median(l.map((p) => p[1])) }));
const xs = lines.flat().map((p) => p[0]), ys = lines.flat().map((p) => p[1]);
const x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3, y0 = Math.min(...ys) - 3, y1 = Math.max(...ys) + 3;
// left panel: the plane, 14 px a room
const k = 14;
const W1 = (x1 - x0) * k, H1 = (y1 - y0) * k;
const P1 = ([x, y]) => [(x - x0) * k, (y - y0) * k];
const polys = (f) => lines.filter((l) => l.length > 3).map((l) => `<polyline points="${l.map((p) => f(p).join(',')).join(' ')}" fill="none" stroke="#b71c1c" stroke-opacity=".07" stroke-width="3" stroke-linejoin="round"/>`).join('');
let grid = '';
for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) grid += `<line x1="${P1([x, 0])[0]}" y1="0" x2="${P1([x, 0])[0]}" y2="${H1}" stroke="#ccc"/><text x="${P1([x, 0])[0] + 2}" y="12" font-size="11" fill="#888">${x}</text>`;
for (let y = Math.ceil(y0 / 10) * 10; y < y1; y += 10) grid += `<line x1="0" y1="${P1([0, y])[1]}" x2="${W1}" y2="${P1([0, y])[1]}" stroke="#ccc"/><text x="2" y="${P1([0, y])[1] - 2}" font-size="11" fill="#888">${y}</text>`;
const label = (f) => marks.map((m) => { const [px, py] = f([m.x, m.y]); return `<circle cx="${px}" cy="${py}" r="${4 + Math.log2(m.n)}" fill="${COLORS[m.a] ?? '#555'}" stroke="#fff" stroke-width="1.5"/><text x="${px + 8}" y="${py + 4}" font-size="13" font-family="sans-serif" font-weight="bold" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${m.a}</text>`; }).join('');
const port = (f) => { const [px, py] = f([0, 0]); return `<rect x="${px - 6}" y="${py - 6}" width="12" height="12" fill="#1565c0" stroke="#000" stroke-width="2"/><text x="${px - 10}" y="${py - 12}" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="end" fill="#003">The Arkania Port</text>`; };
// right panel: world.webp, Arkania island is x 258..448, y 125..320 of 600x480; port at its west tip; stretched so the eastmost walk reaches the island's east edge
const IMG = { x: 245, y: 110, w: 215, h: 225 };
const zoom = 4.2;
const portImg = [262, 200];
const sx = (448 - 262) / x1, sy = (320 - 125) / (y1 - y0) * 0.95;
const P2 = ([x, y]) => [(portImg[0] + x * sx - IMG.x) * zoom, (portImg[1] + y * sy - IMG.y) * zoom];
const W2 = IMG.w * zoom, H2 = IMG.h * zoom;
const svg = `<svg width="${W1 + W2 + 40}" height="${Math.max(H1, H2)}" xmlns="http://www.w3.org/2000/svg">
<g>${grid}${polys(P1)}${label(P1)}${port(P1)}</g>
<g transform="translate(${W1 + 40},0)"><clipPath id="c"><rect width="${W2}" height="${H2}"/></clipPath><g clip-path="url(#c)">
<image href="http://localhost:5000/img/world.webp" x="${-IMG.x * zoom}" y="${-IMG.y * zoom}" width="${600 * zoom}" height="${480 * zoom}" opacity=".9"/>
${polys(P2)}${label(P2)}${port(P2)}</g></g></svg>`;
await withPage('http://localhost:5000/maps/world-v2', async (page) => {
  await page.setViewportSize({ width: Math.round(W1 + W2 + 40), height: Math.round(Math.max(H1, H2)) });
  await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: PNG, fullPage: true });
}, { headless: true });
console.log('walk lines', lines.length, 'plane', Math.round(x1 - x0), 'x', Math.round(y1 - y0), 'rooms');
