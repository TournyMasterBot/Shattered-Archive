// Builds room-hints.import.json (the portable script file the client's Import accepts) from the scripts next to this file.
//   node build-import.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

const scripts = [
  {
    id: 'room-hints-tracker',
    name: 'Room hints: room tracker',
    kind: 'trigger',
    enabled: true,
    language: 'javascript',
    group: 'exploration',
    eventName: 'shatteredarchive:raw-data',
    matchText: '',
    dontRequireMatchText: true,
    source: read('room-tracker.js'),
  },
  {
    id: 'room-hints-alias',
    name: 'Room hints: hint',
    kind: 'alias',
    enabled: true,
    language: 'javascript',
    group: 'exploration',
    alias: 'hint',
    source: read('hint.js'),
  },
  {
    id: 'room-hints-ai-alias',
    name: 'Room hints: hint:ai (local model)',
    kind: 'alias',
    enabled: true,
    language: 'javascript',
    group: 'exploration',
    alias: 'hint:ai',
    source: read('hint-ai.js'),
  },
  {
    id: 'room-hints-teach-alias',
    name: 'Room hints: hint:teach (tell Copilot what works here)',
    kind: 'alias',
    enabled: true,
    language: 'javascript',
    group: 'exploration',
    alias: 'hint:teach {RULE}',
    source: read('hint-teach.js'),
  },
];

const file = {
  schema: 'shatteredArchive.export.v1',
  exportedAt: new Date().toISOString(),
  app: 'game-client',
  items: [{ storage: 'localStorage', key: 'userScripts', format: 'json', kind: 'userScripts', strategyHint: 'mergeById', value: scripts }],
};
fs.writeFileSync(path.join(here, 'room-hints.import.json'), JSON.stringify(file, null, 2) + '\n');
console.log('wrote room-hints.import.json with', scripts.length, 'scripts');
