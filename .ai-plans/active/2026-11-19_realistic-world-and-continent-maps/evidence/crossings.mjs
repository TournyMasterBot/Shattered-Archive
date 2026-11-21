// Zone-to-zone crossings from the player's walks: every time a typed move takes the player from one Arkania area into another, which way it was typed,
// and how many rooms the player was in the first area before leaving (its "length" on that trip). No dead-reckoning through the zones themselves.
//   node crossings.mjs <walks.json> [minCount] [out.json]
import fs from 'node:fs';
const [IN, MIN = '3', OUT] = process.argv.slice(2);
const { sessions, titleArea } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const ta = new Map(titleArea);
const cross = new Map();
for (const s of sessions) {
  let prev = null, run = 0;
  for (const st of s.steps) {
    const set = ta.get(st.title);
    const area = set ? (set.length === 1 ? set[0] : prev && set.includes(prev) ? prev : null) : null; // ambiguous title with no context: unknown
    if (!area) { prev = null; run = 0; continue; }
    if (prev !== null && area !== prev && st.dir !== null) {
      const key = prev + '>' + area;
      const e = cross.get(key) ?? { from: prev, to: area, n: 0, dirs: {}, runs: [] };
      e.n += 1;
      e.dirs[st.dir] = (e.dirs[st.dir] ?? 0) + 1;
      e.runs.push(run);
      cross.set(key, e);
    }
    if (area !== prev) run = 0;
    run += 1;
    prev = area;
  }
}
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
const rows = [...cross.values()].filter((e) => e.n >= Number(MIN)).sort((a, b) => b.n - a.n);
for (const e of rows) {
  const d = Object.entries(e.dirs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}${v}`).join(' ');
  console.log(`${String(e.n).padStart(4)}  ${e.from} > ${e.to}   leaves by ${d}   rooms in first zone: median ${med(e.runs)}`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows.map((e) => ({ ...e, median: med(e.runs) }))));
