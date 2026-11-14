// The `hint` and `hint:teach` user scripts, run the way the client runs them (an async function body with writeTerminal, event and fetch given), against a fake
// network: what each prints, what it asks, and that the script still works when Copilot's server is not there.
//   node --test docs/userscripts/room-hints/hint.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = (name) => fs.readFileSync(path.join(here, name), 'utf8');

const room = { title: 'Chamber of Rest', description: 'A round room with a fountain.', exits: ['north', 'south'], objects: [], unlisted: false };
const csharp = { hints: { title: 'Chamber of Rest', candidates: [{ commands: ['look fountain', 'drink fountain'], phrase: 'fountain', kind: 'water', from: 'description' }], worked: [], struckOff: [], findings: [], reactions: [], roomSocials: [] } };

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Runs a script body with the globals the client gives it. `routes` maps a path to an answer or a function; an unlisted path fails the way an unreachable server does. */
async function run(name, { lastRoom = room, routes = {}, vars = {}, storage } = {}) {
  const out = [];
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ host: u.host, path: u.pathname, method: init.method || 'GET', query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined });
    const route = routes[`${u.host}${u.pathname}`];
    if (route === undefined) throw new TypeError('fetch failed');
    return typeof route === 'function' ? route(u, init) : route;
  };
  const sandboxGlobal = { __saRoom: lastRoom === null ? undefined : { last: lastRoom }, localStorage: storage };
  const body = new Function('writeTerminal', 'event', 'fetch', 'globalThis', 'URLSearchParams', 'AbortController', 'setTimeout', 'clearTimeout', `return (async () => {${source(name)}\n})();`);
  await body((text) => out.push(text), { payload: { vars } }, fetchImpl, sandboxGlobal, URLSearchParams, AbortController, setTimeout, clearTimeout);
  return { text: out.join(''), calls };
}

const COPILOT = 'copilot.shatteredarchive.dev';
const SITE = 'localhost:5000';

test('hint with nothing seen yet says so and asks nothing', async () => {
  const r = await run('hint.js', { lastRoom: null });
  assert.match(r.text, /no room seen yet/);
  assert.deepEqual(r.calls, []);
});

test('hint answers at once from what was taught, and does not ask the word list', async () => {
  const r = await run('hint.js', { routes: { [`${COPILOT}/hints`]: json({ tier: 'learned', commands: ['enter orb', 'look in gate'], notes: ['taught by you: the orb is the way'] }) } });
  assert.match(r.text, /Taught for .*Chamber of Rest/);
  assert.match(r.text, /enter orb {2}\| {2}look in gate/);
  assert.match(r.text, /taught by you/);
  assert.deepEqual(r.calls.map((c) => c.host), [COPILOT]);
  assert.equal(r.calls[0].query.title, 'Chamber of Rest');
  assert.equal(r.calls[0].query.exits, 'north,south');
});

test('hint still shows the word list when Copilot has nothing taught, and adds the local model answer when it has one', async () => {
  const routes = {
    [`${COPILOT}/hints`]: json({ tier: 'local', commands: ['push button'], notes: [] }),
    [`${SITE}/api/agent/room-hints`]: json(csharp),
  };
  const r = await run('hint.js', { routes });
  assert.match(r.text, /Hints for .*Chamber of Rest/);
  assert.match(r.text, /look fountain {2}\| {2}drink fountain/);
  assert.match(r.text, /Local model:.*push button/);
});

test('hint says a ticket was filed when no tier knew the room, and how to teach it', async () => {
  const routes = { [`${COPILOT}/hints`]: json({ tier: 'escalated', commands: [], notes: [] }), [`${SITE}/api/agent/room-hints`]: json({ hints: { ...csharp.hints, candidates: [] } }) };
  const r = await run('hint.js', { routes });
  assert.match(r.text, /Nothing in this room matches the hint list/);
  assert.match(r.text, /a ticket was filed for Claude/);
  assert.match(r.text, /hint:teach/);
});

test('hint works exactly as before with Copilot\'s server down, unreachable or answering badly', async () => {
  for (const copilot of [undefined, json({}, 500), json({ nonsense: true })]) {
    const routes = { [`${SITE}/api/agent/room-hints`]: json(csharp) };
    if (copilot !== undefined) routes[`${COPILOT}/hints`] = copilot;
    const r = await run('hint.js', { routes });
    assert.match(r.text, /look fountain/);
    assert.doesNotMatch(r.text, /Local model|ticket was filed|Taught for/);
  }
});

test('hint reports a word list that does not answer, without throwing', async () => {
  assert.match((await run('hint.js')).text, /the local service did not answer/);
  assert.match((await run('hint.js', { routes: { [`${SITE}/api/agent/room-hints`]: json({}, 503) } })).text, /HTTP 503/);
  assert.match((await run('hint.js', { routes: { [`${SITE}/api/agent/room-hints`]: json({ schemaVersion: 1 }) } })).text, /unexpected reply/);
});

test('hint uses the Copilot address the owner set in this browser, and escapes braces in room text', async () => {
  const storage = { getItem: (k) => (k === 'copilot.api.base' ? 'http://127.0.0.1:65100' : null) };
  const routes = {
    '127.0.0.1:65100/hints': json({ tier: 'learned', commands: ['say {hello}'], notes: [] }),
  };
  const r = await run('hint.js', { storage, routes, lastRoom: { ...room, title: 'The {Odd} Room' } });
  assert.equal(r.calls[0].host, '127.0.0.1:65100');
  assert.match(r.text, /The \{\{Odd} Room/);
  assert.match(r.text, /say \{\{hello}/);
});

test('hint:teach sends what was typed for the room you are in, as the owner\'s answer, and says it was remembered', async () => {
  const routes = { [`${COPILOT}/hints/rules`]: json({ rule: {} }, 201) };
  const r = await run('hint-teach.js', { routes, vars: { RULE: ' enter orb | look in gate |  ' } });
  assert.deepEqual(r.calls.map((c) => [c.method, c.path]), [['POST', '/hints/rules']]);
  assert.deepEqual(r.calls[0].body, { title: 'Chamber of Rest', commands: ['enter orb', 'look in gate'], source: 'owner', note: 'taught in the game with hint:teach' });
  assert.match(r.text, /remembered for .*Chamber of Rest/);
});

test('hint:teach with no room, or nothing typed, asks nothing', async () => {
  const none = await run('hint-teach.js', { lastRoom: null, vars: { RULE: 'x' } });
  assert.match(none.text, /no room seen yet/);
  const empty = await run('hint-teach.js', { vars: { RULE: '  ' } });
  assert.match(empty.text, /say what works here/);
  assert.deepEqual([...none.calls, ...empty.calls], []);
});

test('hint:teach says why a rule was not taken, and that the server must be running when it is not', async () => {
  const refused = await run('hint-teach.js', { vars: { RULE: 'x' }, routes: { [`${COPILOT}/hints/rules`]: json({ error: 'invalid rule', details: ['commands must be 1 to 8 lines'] }, 400) } });
  assert.match(refused.text, /not taken \(invalid rule: commands must be 1 to 8 lines\)/);
  const bare = await run('hint-teach.js', { vars: { RULE: 'x' }, routes: { [`${COPILOT}/hints/rules`]: { ok: false, status: 500, json: async () => { throw new Error('no body'); } } } });
  assert.match(bare.text, /not taken \(HTTP 500\)/);
  const down = await run('hint-teach.js', { vars: { RULE: 'x' } });
  assert.match(down.text, /Copilot's server did not answer/);
});

test('the import file carries all four scripts, with hint:teach taking the rest of the line', () => {
  const file = JSON.parse(fs.readFileSync(path.join(here, 'room-hints.import.json'), 'utf8'));
  const scripts = file.items[0].value;
  assert.deepEqual(scripts.map((s) => s.id), ['room-hints-tracker', 'room-hints-alias', 'room-hints-ai-alias', 'room-hints-teach-alias']);
  assert.equal(scripts[3].alias, 'hint:teach {RULE}');
  assert.equal(scripts[3].source, source('hint-teach.js'));
  assert.equal(scripts[1].source, source('hint.js'));
});
