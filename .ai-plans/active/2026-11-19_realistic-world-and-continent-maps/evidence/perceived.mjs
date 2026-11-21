// Perceived positions: dead-reckon every walk from the Arkania port (one room = one unit in the direction typed, up/down move nothing, a warp loses the
// count until the player is next at the port). Prints the median perceived position of every Arkania area, relative to the port, east +x, south +y.
import fs from 'node:fs';
const [IN, OUT] = process.argv.slice(2);
const { sessions, titleArea } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const ta = new Map(titleArea);
const V = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1], U: [0, 0], D: [0, 0] };
const per = new Map();
const byTitle = new Map();
for (const s of sessions) {
  let pos = null;
  let prev = null;
  for (const st of s.steps) {
    if (st.title === 'The Arkania Port') pos = [0, 0];
    else if (st.dir === null) pos = null;
    else if (pos) pos = [pos[0] + V[st.dir][0], pos[1] + V[st.dir][1]];
    const set = ta.get(st.title);
    const area = set ? (set.length === 1 ? set[0] : prev && set.includes(prev) ? prev : set[0]) : null;
    if (area) prev = area;
    if (pos && area) {
      const list = per.get(area) ?? [];
      list.push(pos);
      per.set(area, list);
      const key = area + ' | ' + st.title;
      const tl = byTitle.get(key) ?? [];
      tl.push(pos);
      byTitle.set(key, tl);
    }
  }
}
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const rows = [...per].map(([area, ps]) => ({ area, n: ps.length, x: med(ps.map((p) => p[0])), y: med(ps.map((p) => p[1])), x0: Math.min(...ps.map((p) => p[0])), x1: Math.max(...ps.map((p) => p[0])), y0: Math.min(...ps.map((p) => p[1])), y1: Math.max(...ps.map((p) => p[1])) }));
rows.sort((a, b) => b.n - a.n);
console.log('area'.padEnd(34), 'visits', 'median(x,y)', 'x range', 'y range');
for (const r of rows.slice(0, 45)) console.log(r.area.padEnd(34), String(r.n).padStart(6), `(${r.x},${r.y})`.padEnd(12), `${r.x0}..${r.x1}`.padEnd(10), `${r.y0}..${r.y1}`);
fs.writeFileSync(OUT, JSON.stringify({ rows, titles: [...byTitle].map(([k, ps]) => [k, ps.length, med(ps.map((p) => p[0])), med(ps.map((p) => p[1]))]) }));
