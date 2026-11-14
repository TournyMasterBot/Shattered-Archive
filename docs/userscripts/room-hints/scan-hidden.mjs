// Runs hidden-room-content.js (the blank-indent detector) over every game log and writes how often it fired per room,
// keyed by the room title the next prompt names. Input for evaluate.mjs.
//   node scan-hidden.mjs [out.json]      default out: hidden-rooms.json next to this file
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] || path.join(here, 'hidden-rooms.json');
const source = fs.readFileSync(path.resolve(here, '../hidden-room-content/hidden-room-content.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const detector = new AsyncFunction('event', 'writeTerminal', source);

const ROOT = 'C:/Projects/DSL/GameLogs';
const files = [];
for (const e of fs.readdirSync(ROOT)) if (/^GameLog-DSL_.*\.txt$/.test(e)) files.push({ p: path.join(ROOT, e), kind: 'txt' });
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/server\.log-.*\.jsonl$/.test(e.name)) files.push({ p, kind: 'jsonl' });
  }
})(ROOT + '/ShatteredArchive/Docker/game-server');

const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
const key = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
const fires = {};
let pending = 0, total = 0;
const marker = () => { pending++; total++; };

for (const f of files) {
  globalThis.__saHiddenRoom = undefined;
  pending = 0;
  const feed = async (data) => {
    await detector({ payload: { rawText: data, text: data } }, marker);
    const m = strip(data).match(/^<\d+\/\d+hp[^>]*> \[([^\]]+)\]/);
    if (m && pending) { const k = key(m[1]); fires[k] = (fires[k] || 0) + pending; pending = 0; }
  };
  const rl = readline.createInterface({ input: fs.createReadStream(f.p, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const l of rl) {
    if (f.kind === 'txt') { await feed(l + '\n'); continue; }
    if (!l.includes('"game:remote-server:raw"')) continue;
    let r; try { r = JSON.parse(l); } catch { continue; }
    await feed(r.payload.data);
  }
}
fs.writeFileSync(outPath, JSON.stringify({ files: files.length, fires: total, rooms: fires }, null, 1));
console.log('files', files.length, 'fires', total, 'rooms', Object.keys(fires).length, '->', outPath);
