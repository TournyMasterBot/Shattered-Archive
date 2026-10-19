// COR-1 evidence: how fast does the MUD answer `get <n> '<x>' vault` / `put ... vault`, and what does a
// SUCCESSFUL pull print? The plugin treats silence for pullConfirmTimeoutMs (default 200 ms) as success and
// attributes a failure line to the get currently in flight; if replies are always far faster than that, the
// late-failure race is theoretical, and if a success line exists the attribution can be made exact.
//
// Usage: node corpus-vault-latency.cjs <docker game-server root> <out.json>
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const root = process.argv[2];
const outFile = process.argv[3];
const GET = /^get\s+(\d+\s+)?'?[^']+'?\s+vault$/i;
const PUT = /^put\s+(\d+\s+)?'?[^']+'?\s+vault$/i;

const deltas = { get: [], put: [] };
const firstLines = { get: {}, put: {} };
let inputs = { get: 0, put: 0 };

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.jsonl')) out.push(p);
  }
  return out;
}
function norm(s) { return s.replace(/\d+/g, 'N').replace(/'[^']*'/g, "'X'").replace(/\s+/g, ' ').trim().slice(0, 90); }
function q(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: s[0], p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] };
}

(async () => {
  for (const f of walk(root, []).sort()) {
    let pending = null; // {kind, t, linesLeft}
    const rl = readline.createInterface({ input: fs.createReadStream(f, 'utf8'), crlfDelay: Infinity });
    for await (const raw of rl) {
      let o; try { o = JSON.parse(raw); } catch { continue; }
      const t = Date.parse(o.timestamp);
      if (o.type === 'game:client:input') {
        let p = o.payload; try { if (typeof p === 'string') p = JSON.parse(p); } catch { continue; }
        const cmd = p && p.type === 'data' && typeof p.data === 'string' ? p.data.trim() : '';
        const kind = GET.test(cmd) ? 'get' : PUT.test(cmd) ? 'put' : null;
        if (kind) { inputs[kind]++; pending = { kind, t, got: 0 }; }
        else pending = null;
        continue;
      }
      if (!pending || o.type !== 'game:remote-server:raw') continue;
      const data = o.payload && o.payload.data;
      if (typeof data !== 'string') continue;
      const text = data.replace(ANSI, '').replace(/\r/g, '').trim();
      if (!text) continue;
      if (pending.got === 0) deltas[pending.kind].push(t - pending.t);
      if (pending.got < 2) {
        const k = norm(text.split('\n')[0]);
        firstLines[pending.kind][k] = (firstLines[pending.kind][k] || 0) + 1;
      }
      pending.got++;
      if (pending.got >= 2) pending = null;
    }
  }
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const out = {
    inputs, getReplyDeltaMs: q(deltas.get), putReplyDeltaMs: q(deltas.put),
    topFirstReplyShapes: { get: top(firstLines.get), put: top(firstLines.put) },
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.inputs), JSON.stringify(out.getReplyDeltaMs));
})();
