// Route atlas v2: literal-compass walks from the port as route lines, solid zones where the walks put them, hollow zones placed from the owner's description.
//   node atlas2.mjs <walks.json> <out.png>
import fs from 'node:fs';
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
const [IN, PNG] = process.argv.slice(2);
const { sessions, titleArea } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const ta = new Map(titleArea);
const V = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1], U: [0, 0], D: [0, 0] };
const areaAt = (st, prev) => { const s = ta.get(st.title); return s ? (s.length === 1 ? s[0] : prev && s.includes(prev) ? prev : null) : null; };

// representative clean trip from the port to the first entry of a zone: the most common direction string, else the shortest
function route(zone, maxSteps = 60) {
  const found = new Map();
  for (const s of sessions) {
    const st = s.steps;
    for (let i = 0; i < st.length; i += 1) {
      if (st[i].title !== 'The Arkania Port') continue;
      let x = 0, y = 0, prev = null;
      const pts = [[0, 0]], dirs = [];
      for (let k = i + 1; k < st.length && k < i + 1 + maxSteps; k += 1) {
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
// walked routes (name, target zone, colour)
const TRIPS = [
  ['port to Arkane', 'Arkane', '#c62828'],
  ['port to the Great Tree', 'Great Tree, The', '#6a1b9a'],
  ['to Balifore', 'Balifore', '#ef6c00'],
  ['to the Enchanted Forest', 'Enchanted Forest', '#00897b'],
  ['to Gahboom Hill', 'Gahboom Hill', '#8d6e63'],
  ['to Rutted Hill (east)', 'Rutted Hill', '#1565c0'],
  ['to Verminasia Forest', 'Verminasia Forest', '#558b2f'],
  ['to the Surging Flow', 'Surging Flow of Viscid Muck, A', '#33691e'],
  ['to the Great Forest', 'Great Forest, The', '#2e7d32'],
  ['to Southlands', 'Southlands of Arkania', '#5d4037'],
];
const routes = TRIPS.map(([name, zone, color]) => ({ name, zone, color, r: route(zone) })).filter((t) => t.r);
for (const t of routes) console.log(`${t.name}: ${t.r.pts.length - 1} rooms, ${t.r.walks} clean walks, ends (${t.r.pts.at(-1)})`);

// solid zones (first-entry from entries.mjs) and the owner's described ones
const solid = [['Kender Forest', 2, 2], ['Arkane (city gate)', 7, 0], ['Balifore', 2, 9], ['Enchanted Forest', 0, 7], ['Gahboom Hill', 4, 10], ['Southlands of Arkania', 14, 11], ['Surging Flow (swamp)', 15, -7], ['Verminasia Forest', 16, -5], ['Rutted Hill', 22, 0], ['Great Forest', 28, -1], ['Great Tree', 4, -6]];
const described = [['Verminasia (north)', 24, -17], ['Mount Levinox (NW)', 6, -14], ['Bloodshackle Fortress', 9, -11], ['Marauders (S / SE)', 11, 18], ['east coast ?', 46, 2], ['Arkane city centre', 11, 0]];

const IMG = { x: 230, y: 95, w: 245, h: 250 }, zoom = 6;
const portImg = [262, 200];
const sx = 4.0, sy = 3.9;
const P = ([x, y]) => [(portImg[0] + x * sx - IMG.x) * zoom, (portImg[1] + y * sy - IMG.y) * zoom];
const W = IMG.w * zoom, H = IMG.h * zoom;
let svg = `<image href="http://localhost:5000/img/world.webp" x="${-IMG.x * zoom}" y="${-IMG.y * zoom}" width="${600 * zoom}" height="${480 * zoom}"/><rect width="${W}" height="${H}" fill="#fff" fill-opacity=".18"/>`;
for (const t of routes) {
  const d = t.r.pts.map((p) => P(p).join(',')).join(' ');
  svg += `<polyline points="${d}" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" stroke-opacity=".85"/><polyline points="${d}" fill="none" stroke="${t.color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
}
const used = [];
const label = (txt, px, py, extra = '') => {
  let y = py + 5;
  while (used.some(([ux, uy]) => Math.abs(ux - (px + 14)) < 150 && Math.abs(uy - y) < 20)) y += 20;
  used.push([px + 14, y]);
  return `<text x="${px + 14}" y="${y}" font-size="17" font-family="sans-serif" font-weight="bold" fill="#111" stroke="#fff" stroke-width="5" paint-order="stroke" ${extra}>${txt}</text>`;
};
for (const [n, x, y] of solid) { const [px, py] = P([x, y]); svg += `<circle cx="${px}" cy="${py}" r="10" fill="#fff" stroke="#111" stroke-width="3"/>${label(n, px, py)}`; }
for (const [n, x, y] of described) { const [px, py] = P([x, y]); svg += `<circle cx="${px}" cy="${py}" r="11" fill="#fff" fill-opacity=".35" stroke="#111" stroke-width="3" stroke-dasharray="5 4"/>${label(n, px, py, 'font-style="italic"')}`; }
const [ppx, ppy] = P([0, 0]);
svg += `<rect x="${ppx - 11}" y="${ppy - 11}" width="22" height="22" fill="#1565c0" stroke="#000" stroke-width="3"/><text x="${ppx - 18}" y="${ppy - 16}" font-size="19" font-family="sans-serif" font-weight="bold" text-anchor="end" fill="#000" stroke="#fff" stroke-width="5" paint-order="stroke">The Arkania Port</text>`;
// legend
let ly = 24;
svg += `<rect x="12" y="8" width="360" height="${40 + (routes.length + 2) * 22}" fill="#fff" fill-opacity=".92" stroke="#444"/><text x="24" y="${ly += 12}" font-size="15" font-family="sans-serif" font-weight="bold">Walked routes (your literal compass inputs), 1 room = 1 step</text>`;
for (const t of routes) svg += `<line x1="24" y1="${ly + 14}" x2="58" y2="${ly + 14}" stroke="${t.color}" stroke-width="5"/><text x="66" y="${ly + 19}" font-size="14" font-family="sans-serif">${t.name}: ${t.r.pts.length - 1} rooms (${t.r.walks}x)</text>`, ly += 22;
svg += `<circle cx="40" cy="${ly + 14}" r="8" fill="#fff" stroke="#111" stroke-width="3"/><text x="66" y="${ly + 19}" font-size="14" font-family="sans-serif">solid: where your walks put the zone</text>`;
ly += 22;
svg += `<circle cx="40" cy="${ly + 14}" r="8" fill="#fff" fill-opacity=".35" stroke="#111" stroke-width="3" stroke-dasharray="4 3"/><text x="66" y="${ly + 19}" font-size="14" font-family="sans-serif" font-style="italic">hollow: from your description, not walked</text>`;
await withPage('http://localhost:5000/maps/world-v2', async (page) => {
  await page.setViewportSize({ width: Math.round(W), height: Math.round(H) });
  await page.setContent(`<body style="margin:0"><svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg></body>`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: PNG });
}, { headless: true });
