// Runs every room in the room list through the hint provider and reports how it holds up.
//   node evaluate.mjs [--rooms rooms.json] [--probes room-probes.json] [--hidden hidden-rooms.json] [--base http://localhost:5000]
// Needs hidden-rooms.json from scan-hidden.mjs (which rooms showed a blank-indent line in the logs) and the local service running.
//
// What is measured:
//   coverage  - variants whose description yields at least one suggestion (asked WITHOUT log history, so it is description-only)
//   recall    - of the things the logs show were tried in a room and the game recognised (blank / reply / not-a-container),
//               how many the description-only suggestions would have offered. Misses are split into "word is in the
//               description but not in the hint list" (a lexicon gap) and "word is not in the description at all".
//   hidden    - the same two numbers for rooms where the detector fired.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const roomsPath = opt('--rooms', 'C:/Projects/DSL/Server/Data/rooms.json');
const probesPath = opt('--probes', 'C:/Projects/DSL/Server/Data/room-probes.json');
const hiddenPath = opt('--hidden', path.join(here, 'hidden-rooms.json'));
const base = opt('--base', 'http://localhost:5000');

const ansi = /\x1b\[[0-9;?]*[A-Za-z]|\[[0-9;]+[A-Za-z]/g;
const key = (t) => String(t).replace(ansi, '').replace(/\s+/g, ' ').trim().toLowerCase();
const flat = (d) => String(d).replace(ansi, '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');

const rooms = JSON.parse(fs.readFileSync(roomsPath, 'utf8'));
const probes = JSON.parse(fs.readFileSync(probesPath, 'utf8')).rooms;
const hidden = JSON.parse(fs.readFileSync(hiddenPath, 'utf8')).rooms;

// ---- ask the provider once per distinct description (no history: title is one nothing was ever tried in)
// Asked per VARIANT (description + object list + exits), the way the userscript asks. Door suggestions ("open north") are counted
// separately so they do not inflate the noun coverage.
const asked = new Map(); // variant id -> candidates[]
const variants = [];
for (const r of rooms) for (const v of r.Variants) { const d = flat(v.RawDescription); if (d) variants.push({ id: variants.length, d, objects: (v.Objects || []).map(flat), exits: v.Exits || [] }); }
const descriptions = new Set(variants.map((v) => v.d));
const queue = [...variants];
let done = 0;
async function worker() {
  while (queue.length) {
    const v = queue.pop();
    const q = new URLSearchParams({ title: 'zz-eval-room-without-history', description: v.d.slice(0, 3900), unlisted: 'false' });
    for (const o of v.objects.slice(0, 40)) q.append('objects', o);
    for (const e of v.exits.slice(0, 12)) q.append('exits', e);
    const res = await fetch(`${base}/api/agent/room-hints?${q}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for a description of ${v.d.length} chars`);
    const j = await res.json();
    asked.set(v.id, j.hints.candidates.map((c) => ({ keyword: c.keyword, kind: c.kind, n: c.commands.length, from: c.from, commands: c.commands })));
    if (++done % 500 === 0) process.stderr.write(`asked ${done}/${variants.length}\n`);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));

// ---- per room: union over its variants
const DIR = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest' };
const dirName = (w) => DIR[w] || (Object.values(DIR).includes(w) ? w : null);
const splitCmd = (c) => (c.startsWith('look in ') ? ['look in', c.slice(8)] : [c.slice(0, c.indexOf(' ')), c.slice(c.indexOf(' ') + 1)]);
const info = new Map(); // roomKey -> { name, offered:Set(verb\u0000keyword), nouns:Set, text, variants, anyHint, fires }
let vid = 0;
for (const r of rooms) {
  const k = key(r.Name);
  const e = info.get(k) || { name: r.Name, offered: new Set(), nouns: new Set(), text: '', variants: 0, anyHint: false, fires: hidden[k] || 0 };
  for (const v of r.Variants) {
    const d = flat(v.RawDescription);
    if (!d) continue;
    e.variants++;
    e.text += ' ' + d.toLowerCase() + ' ' + (v.Objects || []).map(flat).join(' ').toLowerCase();
    const cands = asked.get(vid++) || [];
    if (cands.some((c) => c.kind !== 'door')) e.anyHint = true;
    for (const c of cands) {
      if (c.kind !== 'door') e.nouns.add(c.keyword);
      for (const cmd of c.commands) { const [verb, kw] = splitCmd(cmd); e.offered.add(verb + '\u0000' + kw); }
    }
  }
  info.set(k, e);
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : 'n/a');
const withText = [...info.values()].filter((e) => e.variants > 0);
const hiddenRooms = withText.filter((e) => e.fires > 0);
const plainRooms = withText.filter((e) => e.fires === 0);
const kindCount = {}, kwCount = {};
for (const d of asked.values()) for (const c of d) { if (c.kind === 'door') continue; kindCount[c.kind] = (kindCount[c.kind] || 0) + 1; kwCount[c.keyword] = (kwCount[c.keyword] || 0) + 1; }

console.log(`rooms in list: ${rooms.length} (${withText.length} with a description), room variants asked: ${variants.length}`);
console.log(`\nCOVERAGE (description-only)`);
console.log(`  all rooms:                 ${withText.filter((e) => e.anyHint).length}/${withText.length} = ${pct(withText.filter((e) => e.anyHint).length, withText.length)}`);
console.log(`  rooms with a blank-indent: ${hiddenRooms.filter((e) => e.anyHint).length}/${hiddenRooms.length} = ${pct(hiddenRooms.filter((e) => e.anyHint).length, hiddenRooms.length)}`);
console.log(`  rooms without one:         ${plainRooms.filter((e) => e.anyHint).length}/${plainRooms.length} = ${pct(plainRooms.filter((e) => e.anyHint).length, plainRooms.length)}`);
console.log(`  suggestions by kind:`, JSON.stringify(kindCount));
console.log(`  most-suggested words:`, Object.entries(kwCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', '));

// ---- recall against what the logs show was recognised by the game
const RECOGNISED = new Set(['blank', 'response', 'notContainer']);
const carriedTries = new Set(); // distinct room+verb+keyword whose word matched something carried
let textOnlyTries = 0;           // look answered with text and nothing else was learned: an extra description or an object, unknown
const triples = new Map(); // roomKey|verb|keyword -> true (distinct, not weighted by repeats)
for (const [rk, list] of Object.entries(probes)) {
  const e = info.get(rk);
  if (!e || e.variants === 0) continue;
  for (const p of list) {
    if (!RECOGNISED.has(p.outcome)) continue;
    // The word matched an item in the pack when it was typed: the reply may be about that item, so it says nothing about the room.
    if (p.carried) { carriedTries.add(`${rk}\u0000${p.verb}\u0000${p.keyword}`); continue; }
    // Only evidence of an OBJECT counts: a blank "look", any reply to "look in" but "not here", any reply to enter/open/drink/push/pull/press.
    // Text from "look" alone may be a hidden extra description (an extended keyword), which is a different feature.
    const objectEvidence = (p.verb === 'look' && p.outcome === 'blank') || (p.verb === 'look in' && p.outcome !== 'notSeen') || (p.verb !== 'look' && p.verb !== 'look in');
    if (!objectEvidence) { textOnlyTries++; continue; }
    triples.set(`${rk}\u0000${p.verb}\u0000${p.keyword}`, p);
  }
}
const wordWords = (kw) => kw.split(' ').filter((w) => w.length >= 3);
// exact: the game would have been given this verb AND this word; wordOnly: this word was offered with some other verb
const offeredWith = (e, verb, kw) => [...e.offered].some((o) => {
  const [v, k] = o.split('\u0000');
  if (verb && v !== verb) return false;
  const dn = dirName(kw);
  if (dn) return k === dn;
  return wordWords(kw).some((w) => k.startsWith(w));
});
const hit = (e, kw, verb) => offeredWith(e, verb, kw);
const wordOnly = (e, kw) => offeredWith(e, '', kw);
const inText = (e, kw) => kw.split(' ').some((w) => w.length >= 3 && new RegExp(`\\b${w.replace(/[^a-z0-9']/g, '')}`).test(e.text));
// A word recognised in many different rooms is carried even when no inventory listing came before it in that session.
const firstWord = (kw) => kw.split(' ').find((w) => w.length >= 3) || kw; // "read soul page 3" and "look soul" are the same carried book
const roomsPerWord = new Map();
for (const k of triples.keys()) {
  const [rk, , kw] = k.split('\u0000');
  const w = firstWord(kw);
  (roomsPerWord.get(w) || roomsPerWord.set(w, new Set()).get(w)).add(rk);
}
const LIKELY_CARRIED_ROOMS = 8;
const tally = { total: 0, hit: 0, wrongVerb: 0, gap: 0, undescribed: 0, likelyCarried: 0 };
const byVerb = {}, gaps = new Map(), undesc = new Map();
const hiddenTally = { total: 0, hit: 0 };
for (const [k, p] of triples) {
  const [rk, verb, kw] = k.split('\u0000');
  const e = info.get(rk);
  if ((roomsPerWord.get(firstWord(kw))?.size || 0) >= LIKELY_CARRIED_ROOMS && !hit(e, kw, verb)) { tally.likelyCarried++; continue; }
  tally.total++;
  byVerb[verb] ??= { total: 0, hit: 0 };
  byVerb[verb].total++;
  if (e.fires > 0) hiddenTally.total++;
  if (hit(e, kw, verb)) { tally.hit++; byVerb[verb].hit++; if (e.fires > 0) hiddenTally.hit++; }
  else if (wordOnly(e, kw)) tally.wrongVerb++;
  else if (dirName(kw) || inText(e, kw)) { tally.gap++; const w = kw.split(' ')[0]; gaps.set(w, (gaps.get(w) || 0) + 1); }
  else { tally.undescribed++; const w = kw.split(' ')[0]; undesc.set(w, (undesc.get(w) || 0) + 1); }
}
console.log(`\nRECALL (distinct room+verb+keyword the game recognised, ${tally.total} of them)`);
console.log(`  counted: tries that show an OBJECT (blank look, look in answered, an interaction answered); left out ${textOnlyTries} "look" tries that only returned text (hidden extra description or object: not told apart)`);
console.log(`  left out: ${carriedTries.size} whose word matched an item being carried (inventory-flagged), and ${tally.likelyCarried} more recognised in ${LIKELY_CARRIED_ROOMS}+ different rooms (almost certainly carried; no inventory listing came before them)`);
console.log(`  offered by the hint list:            ${tally.hit} = ${pct(tally.hit, tally.total)}`);
console.log(`  the word was offered, with a different verb: ${tally.wrongVerb} = ${pct(tally.wrongVerb, tally.total)}`);
console.log(`  word is in the room text, not in the hint list (lexicon gap): ${tally.gap} = ${pct(tally.gap, tally.total)}`);
console.log(`  word is NOT in the room text (carried item, or genuinely unlisted): ${tally.undescribed} = ${pct(tally.undescribed, tally.total)}`);
console.log(`  in rooms with a blank-indent line:   ${hiddenTally.hit}/${hiddenTally.total} = ${pct(hiddenTally.hit, hiddenTally.total)}`);
console.log(`  by verb:`, Object.entries(byVerb).map(([v, t]) => `${v} ${t.hit}/${t.total}`).join(', '));
console.log(`  top lexicon gaps (word: rooms):`, [...gaps].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w, n]) => `${w} ${n}`).join(', '));
console.log(`  top words not in the room text:`, [...undesc].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w, n]) => `${w} ${n}`).join(', '));

// ---- the rooms where the detector fired
console.log(`\nBLANK-INDENT ROOMS in the list (${hiddenRooms.length}); most fires first`);
for (const e of hiddenRooms.sort((a, b) => b.fires - a.fires).slice(0, 30)) {
  console.log(`  ${String(e.fires).padStart(6)}  ${e.name.padEnd(42)} ${e.anyHint ? [...e.nouns].slice(0, 6).join(', ') : '(no suggestion)'}`);
}
const missing = Object.entries(hidden).filter(([k]) => !info.has(k) || info.get(k).variants === 0);
console.log(`\nrooms where the detector fired but the room list has no description: ${missing.length} of ${Object.keys(hidden).length}`);
console.log('  ', missing.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k} (${n})`).join('; '));
