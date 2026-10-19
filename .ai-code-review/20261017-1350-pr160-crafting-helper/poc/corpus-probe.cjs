// Probe: print the shape (keys, truncated values) of the first few raw / input / gmcp records.
// Usage: node corpus-probe.cjs <one server.log-*.jsonl>
const fs = require('fs');
const readline = require('readline');

const file = process.argv[2];
const want = { 'game:remote-server:raw': 2, 'game:client:input': 2, 'game:remote-server:gmcp': 1 };
const seen = {};
const typeCounts = {};

const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
rl.on('line', (line) => {
  let o;
  try { o = JSON.parse(line); } catch { return; }
  typeCounts[o.type] = (typeCounts[o.type] || 0) + 1;
  if (want[o.type] && (seen[o.type] || 0) < want[o.type]) {
    seen[o.type] = (seen[o.type] || 0) + 1;
    const p = o.payload;
    console.log(o.type, '| subtype=', o.subtype, '| payload type=', typeof p,
      '| keys=', p && typeof p === 'object' ? Object.keys(p).join(',') : '-');
    const s = typeof p === 'string' ? p : JSON.stringify(p);
    console.log('   ', s.slice(0, 300).replace(/\x1b/g, '\\e'));
  }
});
rl.on('close', () => {
  const top = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('top types:', JSON.stringify(top));
});
