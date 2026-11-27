// Reads GMCP lines (already filtered by grep) from stdin and reports, per package: how many, the days seen, and the union of payload
// key paths with the value types seen. Prints KEYS AND TYPES ONLY, never values (character names are Personal data).
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const stats = new Map();

function walk(value, prefix, into) {
  if (Array.isArray(value)) {
    into.add(`${prefix}[]`);
    for (const item of value.slice(0, 5)) walk(item, `${prefix}[]`, into);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, prefix ? `${prefix}.${k}` : k, into);
    return;
  }
  into.add(`${prefix}:${value === null ? 'null' : typeof value}`);
}

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
  const pkg = sp === -1 ? data : data.slice(0, sp);
  let s = stats.get(pkg);
  if (!s) {
    s = { count: 0, days: new Set(), keys: new Map(), parseErrors: 0, maxLen: 0 };
    stats.set(pkg, s);
  }
  s.count++;
  s.days.add(String(rec.timestamp).slice(0, 10));
  s.maxLen = Math.max(s.maxLen, data.length);
  if (sp === -1) continue;
  let body;
  try {
    body = JSON.parse(data.slice(sp + 1));
  } catch {
    s.parseErrors++;
    continue;
  }
  const keys = new Set();
  walk(body, '', keys);
  for (const k of keys) s.keys.set(k, (s.keys.get(k) ?? 0) + 1);
}

for (const [pkg, s] of [...stats].sort((a, b) => b[1].count - a[1].count)) {
  const days = [...s.days].sort();
  console.log(`\n## ${pkg}  count=${s.count} days=${days.length} (${days[0]}..${days[days.length - 1]}) parseErrors=${s.parseErrors} maxLen=${s.maxLen}`);
  const sorted = [...s.keys].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, n] of sorted) console.log(`  ${k}  x${n}`);
}
