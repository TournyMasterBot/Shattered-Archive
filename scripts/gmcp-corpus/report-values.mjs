// Distinct values of the ENUM-like GMCP fields only (never names, descriptions or numbers that identify a person).
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const sets = {
  'room_data.sector': new Map(),
  'room_data.exits[]': new Map(),
  'char_data.stance': new Map(),
  'char_data.language': new Map(),
  'char_data.chamber (values)': new Map(),
  'affect.lc': new Map(),
  'affect.t': new Map(),
  'affect.m (sign)': new Map(),
  'tick.time': new Map(),
  'login_data.time': new Map(),
  'char_data.tnl (sign)': new Map(),
  'char_data.is_riding': new Map(),
};
const bump = (key, v) => sets[key].set(String(v), (sets[key].get(String(v)) ?? 0) + 1);
const sign = (n) => (n < 0 ? 'negative' : n === 0 ? 'zero' : 'positive');
const shape = (t) => String(t).replace(/\d/g, '9');
let emptyRoomNames = 0;
let sampleExitsEmpty = 0;
let colourInRoom = 0;
let roomCount = 0;

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
  if (sp === -1) continue;
  const pkg = data.slice(0, sp);
  let body;
  try {
    body = JSON.parse(data.slice(sp + 1));
  } catch {
    continue;
  }
  if (pkg === 'room_data') {
    roomCount++;
    bump('room_data.sector', body.sector);
    for (const e of body.exits ?? []) bump('room_data.exits[]', e);
    if ((body.exits ?? []).length === 0) sampleExitsEmpty++;
    if (!body.room) emptyRoomNames++;
    // an escape character in a room name is exactly what is being counted here
    if (/\x1b|\{[a-zA-Z]/.test(String(body.room))) colourInRoom++;
  } else if (pkg === 'char_data') {
    bump('char_data.stance', body.stance);
    bump('char_data.language', body.language);
    if ('chamber' in body) bump('char_data.chamber (values)', body.chamber);
    bump('char_data.tnl (sign)', sign(body.tnl));
    bump('char_data.is_riding', body.is_riding);
  } else if (pkg === 'add_affect') {
    bump('affect.lc', body.lc);
    bump('affect.t', body.t);
    bump('affect.m (sign)', sign(body.m));
  } else if (pkg === 'affect_data') {
    for (const a of body.affects ?? []) {
      bump('affect.lc', a.lc);
      bump('affect.t', a.t);
      bump('affect.m (sign)', sign(a.m));
    }
  } else if (pkg === 'tick') {
    bump('tick.time', shape(body.time));
  } else if (pkg === 'login_data') {
    bump('login_data.time', shape(body.time));
  }
}

for (const [key, map] of Object.entries(sets)) {
  const entries = [...map].sort((a, b) => b[1] - a[1]);
  console.log(`\n## ${key}  (${entries.length} distinct)`);
  console.log(entries.slice(0, 70).map(([v, n]) => `${v}=${n}`).join('  '));
}
console.log(`\nroom_data: ${roomCount} messages, ${emptyRoomNames} with an empty room name, ${sampleExitsEmpty} with no exits, ${colourInRoom} with colour codes in the room name`);
