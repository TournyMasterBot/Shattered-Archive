/**
 * The training session's own log: one JSON line per suggestion answered, in the private data folder (never in the repository). It says what
 * Copilot proposed, what the trainer did and why (with its source reference), and which of the seven focus areas it was about, so a session
 * can be summarised and the thin areas found.
 */
import fs from 'node:fs';
import path from 'node:path';

export const FOCUS_AREAS = ['navigating', 'interacting', 'fighting', 'inventory', 'buffs', 'healing', 'stats'];

const VERBS = {
  navigating: /^(n|s|e|w|u|d|ne|nw|se|sw|north|south|east|west|up|down|northeast|northwest|southeast|southwest|recall|scan|exits|where|areas|enter|map)$/,
  interacting: /^(open|close|lock|unlock|pick|look|l|examine|read|push|pull|search|list|buy|sell|value|give|say|tell|ask|talk|follow|group|sit|stand|knock)$/,
  fighting: /^(kill|k|hit|bash|trip|kick|backstab|bs|circle|dirt|disarm|gouge|headbutt|strike|murder|flee|consider|con|cons|rescue|assist|wimpy|berserk)$/,
  inventory: /^(get|take|drop|wear|wield|remove|hold|put|sacrifice|junk|inventory|inv|i|equipment|eq|loot|compare|donate|light|extinguish)$/,
  buffs: /^(affects|aff|cast|c|bless|armor|recite|brandish|zap|detect|dispel)$/,
  healing: /^(rest|sleep|wake|heal|quaff|drink|eat|meditate|cure|refresh|restore|pray)$/,
  stats: /^(score|sc|worth|attributes|stats|practice|train|gain|levels|skills|spells|time|report)$/,
};

/** The focus area of a command, from its first word; fight and cast details refine it (a heal or an armor spell is not a fight). */
export function areaOfCommand(command) {
  const words = String(command).trim().toLowerCase().split(/\s+/);
  const verb = words[0] ?? '';
  if (verb === 'cast' || verb === 'c') {
    const spell = words.slice(1).join(' ').replace(/['"]/g, '');
    if (/^(cure|heal|refresh|restore|sanctuary)/.test(spell)) return 'healing';
    if (/^(fire|burn|acid|chain|lightning|cause|colour|magic missile|chill|shocking|harm|dispel evil|call)/.test(spell)) return 'fighting';
    return 'buffs';
  }
  for (const area of FOCUS_AREAS) if (VERBS[area].test(verb)) return area;
  return undefined;
}

/** One log line from the suggestion Copilot made and the answer the trainer gave. */
export function entryFor(pending, answer, now) {
  const entry = {
    at: new Date(now).toISOString(),
    suggestionId: pending.id,
    sphere: pending.sphere,
    kind: pending.kind,
    command: pending.command,
    rationale: pending.rationale,
    situation: pending.situation,
    action: answer.action,
    area: areaOfCommand(answer.command ?? pending.command) ?? 'other',
  };
  if (answer.command !== undefined) entry.corrected = answer.command;
  if (answer.why !== undefined) entry.why = answer.why;
  return entry;
}

export function appendEntry(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** Counts per focus area and action, and the areas nothing has been asked about yet. */
export function summarize(entries) {
  const byArea = Object.fromEntries([...FOCUS_AREAS, 'other'].map((a) => [a, { approve: 0, correct: 0, reject: 0 }]));
  for (const e of entries) if (byArea[e.area] && byArea[e.area][e.action] !== undefined) byArea[e.area][e.action] += 1;
  const untouched = FOCUS_AREAS.filter((a) => Object.values(byArea[a]).every((n) => n === 0));
  return { total: entries.length, byArea, untouched };
}

export function readEntries(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}
