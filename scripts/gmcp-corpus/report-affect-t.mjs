// For affect names (spell and skill names, not personal data): which `t` values does each name carry?
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const byName = new Map();
const take = (a) => {
  const row = byName.get(a.n) ?? { count: 0, t: new Map(), lc: new Map(), d: new Set() };
  row.count++;
  row.t.set(a.t, (row.t.get(a.t) ?? 0) + 1);
  row.lc.set(a.lc, (row.lc.get(a.lc) ?? 0) + 1);
  byName.set(a.n, row);
};
for await (const line of rl) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    continue;
  }
  const data = rec?.payload?.data;
  if (typeof data !== 'string') continue;
  const sp = data.indexOf(' ');
  const pkg = data.slice(0, sp);
  if (pkg !== 'add_affect' && pkg !== 'affect_data') continue;
  let body;
  try {
    body = JSON.parse(data.slice(sp + 1));
  } catch {
    continue;
  }
  if (pkg === 'add_affect') take(body);
  else for (const a of body.affects ?? []) take(a);
}
const rows = [...byName].sort((a, b) => b[1].count - a[1].count);
console.log(`distinct affect names: ${rows.length}`);
let deterministic = 0;
for (const [, r] of rows) if (r.t.size === 1) deterministic++;
console.log(`names with exactly one t value: ${deterministic} of ${rows.length}`);
for (const [name, r] of rows.slice(0, 45)) {
  const ts = [...r.t].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${t}x${n}`).join(',');
  const lcs = [...r.lc].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l]) => l).join('|');
  console.log(`${name.padEnd(24)} n=${String(r.count).padEnd(6)} t=[${ts}] t-distinct=${r.t.size} lc=${lcs}`);
}
