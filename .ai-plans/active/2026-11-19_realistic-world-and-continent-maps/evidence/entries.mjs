// Where each Arkania zone is first entered, dead-reckoned from the port over OVERLAND steps only:
//  - a step with no typed direction (portal, gate, recall, teleport) ends the count;
//  - a crossing into a new zone out of an inside/cave room (a shortcut-looking exit) ends the count and is listed as a shortcut candidate;
//  - the count also ends after 60 steps from the port, because the error grows with every room.
// Prints the median first-entry position per zone (east +x, south +y) with the number of walks that agree, and the shortcut candidates.
import fs from 'node:fs';
const [IN, OUT] = process.argv.slice(2);
const { sessions, titleArea } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const ta = new Map(titleArea);
const V = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1], U: [0, 0], D: [0, 0] };
const entries = new Map();
const shortcuts = new Map();
const OVERLAND = new Set(['forest', 'field', 'hills', 'road', 'city', 'mountain', 'swamp', 'desert', 'trail', 'path', 'beach']);
for (const s of sessions) {
  let pos = null, prev = null, prevSector = null, steps = 0, viaInside = false;
  const seen = new Set();
  for (const st of s.steps) {
    const set = ta.get(st.title);
    const area = set ? (set.length === 1 ? set[0] : prev && set.includes(prev) ? prev : null) : null;
    if (st.title === 'The Arkania Port') { pos = [0, 0]; steps = 0; viaInside = false; seen.clear(); prev = area; prevSector = st.sector; continue; }
    if (st.dir === null) { pos = null; prev = area; prevSector = st.sector; continue; }
    if (pos) {
      if (st.sector === 'inside') viaInside = true;
      pos = [pos[0] + V[st.dir][0], pos[1] + V[st.dir][1]];
      steps += 1;
      if (steps > 60) pos = null;
    }
    if (pos && area && area !== prev && prev !== null) {
      if (!seen.has(area)) {
        seen.add(area);
        const l = entries.get(area) ?? [];
        l.push([...pos, steps, viaInside ? 1 : 0]);
        entries.set(area, l);
      }
    }
    prev = area ?? prev;
    prevSector = st.sector;
  }
}
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const rows = [...entries].map(([area, l]) => { const clean = l.filter((p) => p[3] === 0); return { area, n: l.length, clean: clean.length, x: med((clean.length ? clean : l).map((p) => p[0])), y: med((clean.length ? clean : l).map((p) => p[1])), steps: med((clean.length ? clean : l).map((p) => p[2])) }; }).sort((a, b) => b.clean - a.clean || b.n - a.n);
console.log('zone first entered at (x east, y south) from the port, by overland steps; walks; steps from the port');
for (const r of rows) console.log(r.area.padEnd(32), `(${r.x},${r.y})`.padEnd(10), `${r.clean} clean of ${r.n}`.padEnd(14), ' steps', r.steps, r.clean === 0 ? '  <- only via inside rooms' : '');
console.log('\nshortcut candidates (leaving an inside room straight onto open ground in another zone):');
for (const [k, n] of [...shortcuts].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(n).padStart(4), k);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ rows, shortcuts: [...shortcuts] }));
