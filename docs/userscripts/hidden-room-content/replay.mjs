// Replays a server.log-*.jsonl through hidden-room-content.js exactly as the client runs a JS trigger
// (AsyncFunction, `event` and `writeTerminal` bound) and prints where the marker fired.
//   node replay.mjs <server.log-....jsonl>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'hidden-room-content.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const fn = new AsyncFunction('event', 'writeTerminal', source);

let room = '(before first room)';
let fired = [];
const counts = new Map();
let pending = 0;
const marker = () => { pending++; };

const rl = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean);
let chunks = 0;
for (const l of rl) {
  let r; try { r = JSON.parse(l); } catch { continue; }
  if (r.type === 'game:remote-server:gmcp' && r.payload.data.startsWith('room_data')) {
    const m = r.payload.data.match(/"room": "([^"]*)"/); if (m) room = m[1]; if (pending) { counts.set(room, (counts.get(room) || 0) + pending); fired.length += pending; pending = 0; }
  } else if (r.type === 'game:remote-server:raw') {
    chunks++;
    await fn({ payload: { rawText: r.payload.data, text: r.payload.data } }, marker);
  }
}
console.log('chunks', chunks, 'markers', fired.length);
for (const [k, v] of counts) console.log(v, k);
