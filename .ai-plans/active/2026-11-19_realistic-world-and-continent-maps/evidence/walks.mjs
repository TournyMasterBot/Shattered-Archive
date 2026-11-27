// Extracts the walks of the player's real sessions from the game-server logs: for each connection to dsl-mud.org:4000 the rooms entered in order, with the
// direction typed to enter each and the room's title, sector and exits. Keeps the sessions that spend time on the Arkania continent.
//   node walks.mjs <audited map.json> <log root> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [MAP, ROOT, OUT] = process.argv.slice(2);
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const ARKANIA = map.continents.find((c) => c.name === 'Arkane');
// title -> areas (Arkania continent only, that is what we keep sessions for)
const titleArea = new Map();
for (const a of ARKANIA.areas) for (const s of a.subzones) for (const r of s.rooms) {
  if (r.aliasOf) continue;
  const set = titleArea.get(r.title) ?? new Set();
  set.add(a.name);
  titleArea.set(r.title, set);
}
const DIRS = { n: 'N', north: 'N', s: 'S', south: 'S', e: 'E', east: 'E', w: 'W', west: 'W', ne: 'NE', northeast: 'NE', nw: 'NW', northwest: 'NW', se: 'SE', southeast: 'SE', sw: 'SW', southwest: 'SW', u: 'U', up: 'U', d: 'D', down: 'D' };
const FAIL = /Alas, you cannot go that way|is closed|is locked|You are too exhausted|You can't go|There is no way|No way!|You cannot|are unable to move/i;
const ansi = /\x1b\[[0-9;?]*[A-Za-z]/g;

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.jsonl')) files.push(p); } })(ROOT);
files.sort();

const sessions = [];
let cur = null;
let connected = false;
let queue = [];
let raw = '';
const finish = () => { if (cur && cur.steps.length > 0) sessions.push(cur); cur = null; connected = false; queue = []; raw = ''; };

for (const file of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const isInput = line.startsWith('{"type":"game:client:input"');
    const isGmcp = line.includes('room_data ');
    const isRaw = line.startsWith('{"type":"game:remote-server:raw"');
    const isClose = line.includes('connection:closed') || line.includes('client-closed');
    if (!isInput && !isGmcp && !isRaw && !isClose) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (isClose) { finish(); continue; }
    if (isInput) {
      let p;
      try { p = JSON.parse(r.payload); } catch { continue; }
      if (p.type === 'connect') { finish(); connected = p.host === 'dsl-mud.org' && Number(p.port) === 4000; if (connected) cur = { start: r.timestamp, file: path.basename(file), steps: [] }; continue; }
      if (!connected || p.type !== 'data' || typeof p.data !== 'string') continue;
      for (const part of p.data.split(/[;\n\r]+/)) {
        const t = part.trim().toLowerCase();
        const m = /^(\d+)?\s*([a-z]+)$/.exec(t);
        if (m && DIRS[m[2]]) for (let i = 0; i < Number(m[1] ?? 1); i += 1) queue.push(DIRS[m[2]]);
      }
      raw = '';
      continue;
    }
    if (!connected) continue;
    if (isRaw) {
      raw += (r.payload?.data ?? '').replace(ansi, '');
      if (queue.length > 0 && FAIL.test(raw)) { queue.shift(); raw = ''; }
      continue;
    }
    if (isGmcp) {
      const d = r.payload?.data;
      if (typeof d !== 'string' || !d.startsWith('room_data ')) continue;
      let room;
      try { room = JSON.parse(d.slice(10)); } catch { continue; }
      const last = cur.steps[cur.steps.length - 1];
      const dir = queue.length > 0 ? queue.shift() : null;
      const same = last && last.title === room.room;
      if (dir === null && same) continue; // the room again with a prompt
      cur.steps.push({ t: r.timestamp, dir, title: room.room, sector: room.sector, exits: room.exits });
      raw = '';
    }
  }
}
finish();
const keep = sessions.filter((s) => s.steps.filter((x) => titleArea.has(x.title)).length >= 15);
console.log('sessions', sessions.length, 'with Arkania', keep.length, 'steps', keep.reduce((n, s) => n + s.steps.length, 0));
fs.writeFileSync(OUT, JSON.stringify({ sessions: keep, titleArea: [...titleArea].map(([t, s]) => [t, [...s]]) }));
