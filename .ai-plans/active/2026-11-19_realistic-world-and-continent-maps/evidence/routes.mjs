// Finds trips between two landmarks in the player's sessions and prints them: rooms walked, the area at each stretch, the typed directions.
//   node routes.mjs <walks.json> <fromTitleRegex|area:Name> <toTitleRegex|area:Name> [maxTrips]
// A trip starts at a room matching FROM and ends at the first later room matching TO, with no gap of more than 40 unknown-title steps.
import fs from 'node:fs';
const [IN, FROM, TO, MAX = '12'] = process.argv.slice(2);
const { sessions, titleArea } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const ta = new Map(titleArea);
const matcher = (spec) => {
  if (spec.startsWith('area:')) { const n = spec.slice(5); return (st) => (ta.get(st.title) ?? []).includes(n); }
  const re = new RegExp(spec, 'i');
  return (st) => re.test(st.title);
};
const isFrom = matcher(FROM), isTo = matcher(TO);
const areaOf = (st, prev) => { const s = ta.get(st.title); return s ? (s.length === 1 ? s[0] : prev && s.includes(prev) ? prev : s[0]) : '?'; };
const trips = [];
for (const s of sessions) {
  const st = s.steps;
  for (let i = 0; i < st.length; i += 1) {
    if (!isFrom(st[i])) continue;
    for (let j = i + 1; j < st.length && j < i + 400; j += 1) {
      if (st[j].dir === null && j > i + 1 && !ta.has(st[j].title)) break; // warped away
      if (isTo(st[j])) { trips.push({ s, i, j }); i = j; break; }
    }
  }
}
// unique by direction string
const seen = new Map();
for (const t of trips) {
  const moves = t.s.steps.slice(t.i + 1, t.j + 1).map((x) => x.dir ?? '*');
  const key = moves.join(',');
  const e = seen.get(key) ?? { n: 0, t, moves };
  e.n += 1;
  seen.set(key, e);
}
console.log(`${trips.length} trips ${FROM} -> ${TO}; ${seen.size} different step sequences`);
const list = [...seen.values()].sort((a, b) => b.n - a.n || a.moves.length - b.moves.length).slice(0, Number(MAX));
for (const e of list) {
  const { s, i, j } = e.t;
  let prev = null;
  const areas = [];
  for (let k = i; k <= j; k += 1) { const a = areaOf(s.steps[k], prev); prev = a; if (areas.length === 0 || areas[areas.length - 1][0] !== a) areas.push([a, 0]); areas[areas.length - 1][1] += 1; }
  console.log(`\n x${e.n}  ${e.moves.length} rooms  (${s.start.slice(0, 10)})  ${areas.map(([a, n]) => `${a}[${n}]`).join(' > ')}`);
  console.log('   ' + e.moves.join(' '));
}
