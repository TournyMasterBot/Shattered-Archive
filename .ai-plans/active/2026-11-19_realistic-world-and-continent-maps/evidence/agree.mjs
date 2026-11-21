// How well do the placements inside each continent agree with the directions the exits between its areas point?
//   node agree.mjs <label=map.json> ...
import * as core from 'file:///C:/Projects/ShatteredArchive/services/shattered-maps-core/dist/index.js';
import fs from 'node:fs';
const U = { N: [0, -1], NE: [Math.SQRT1_2, -Math.SQRT1_2], E: [1, 0], SE: [Math.SQRT1_2, Math.SQRT1_2], S: [0, 1], SW: [-Math.SQRT1_2, Math.SQRT1_2], W: [-1, 0], NW: [-Math.SQRT1_2, -Math.SQRT1_2] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
for (const pair of process.argv.slice(2)) {
  const [label, file] = pair.split('=');
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  let ok = 0, tot = 0, okw = 0, totw = 0;
  const per = [];
  for (const c of map.continents) {
    if (c.id === 'az-unsorted') continue;
    const slice = core.sliceMap(map, 'continent', c.id);
    const rect = new Map(slice.areas.filter((a) => a.placement).map((a) => [a.id, a.placement]));
    const pairs = new Map();
    for (const l of slice.areaLinks) {
      const [a, b, d] = l.from < l.to ? [l.from, l.to, l.dir] : [l.to, l.from, OPP[l.dir] ?? l.dir];
      const e = pairs.get(a + '|' + b) ?? { a, b, vx: 0, vy: 0, n: 0 };
      if (U[d]) { e.vx += U[d][0] * l.count; e.vy += U[d][1] * l.count; e.n += l.count; }
      pairs.set(a + '|' + b, e);
    }
    let cok = 0, ctot = 0;
    for (const e of pairs.values()) {
      const len = Math.hypot(e.vx, e.vy);
      if (e.n < 2 || len / e.n < 0.5) continue;
      const ra = rect.get(e.a), rb = rect.get(e.b);
      if (!ra || !rb) continue;
      const vx = rb.x + rb.w / 2 - (ra.x + ra.w / 2), vy = rb.y + rb.h / 2 - (ra.y + ra.h / 2);
      const hit = (vx * e.vx + vy * e.vy) / ((Math.hypot(vx, vy) || 1) * len) >= Math.cos(Math.PI / 4);
      tot += 1; totw += e.n; ctot += 1;
      if (hit) { ok += 1; okw += e.n; cok += 1; }
    }
    per.push(`${c.name} ${cok}/${ctot}`);
  }
  console.log(`${label}: ${ok}/${tot} agree (${Math.round((100 * ok) / tot)}%), by exits ${Math.round((100 * okw) / totw)}%   [${per.join(', ')}]`);
}
