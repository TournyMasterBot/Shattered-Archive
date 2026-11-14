// Replays a server.log-*.jsonl through room-tracker.js exactly as the client runs a JS trigger, then runs hint.js against the
// local service at the end of the log (or at the Nth room render with --render N) and prints what the terminal would show.
//   node replay.mjs <server.log-....jsonl> [--render N] [--base http://localhost:5000]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const file = args.find((a) => !a.startsWith('--') && fs.existsSync(a));
const stopAt = Number(opt('--render', 0));
const wantTitle = opt('--title', '');
const base = opt('--base', 'http://localhost:5000');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const tracker = new AsyncFunction('event', 'writeTerminal', fs.readFileSync(path.join(here, 'room-tracker.js'), 'utf8'));
const hint = new AsyncFunction('writeTerminal', fs.readFileSync(path.join(here, 'hint.js'), 'utf8').replace("'http://localhost:5000'", JSON.stringify(base)));

globalThis.__saRoom = undefined;
let renders = 0, lastKey = '', snapshot;
for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!l.includes('"game:remote-server:raw"')) continue;
  let r; try { r = JSON.parse(l); } catch { continue; }
  await tracker({ payload: { rawText: r.payload.data, text: r.payload.data } }, () => {});
  const cur = globalThis.__saRoom && globalThis.__saRoom.last;
  const key = cur ? cur.title + '|' + cur.description + '|' + cur.unlisted : '';
  if (key && key !== lastKey) { lastKey = key; renders++; }
  if (wantTitle && cur && cur.title === wantTitle) snapshot = { ...cur };
  if (stopAt && renders === stopAt) break;
}
if (wantTitle) globalThis.__saRoom.last = snapshot;

const room = globalThis.__saRoom && globalThis.__saRoom.last;
console.log('tracked room:', room ? JSON.stringify({ ...room, description: room.description.slice(0, 70) + '...' }) : '(none)');
const out = [];
await hint((s) => out.push(s));
console.log(out.join('').replace(/\{\{/g, '\u0001').replace(/\{[a-zA-Z!\-&_]/g, '').replace(/\u0001/g, '{'));
