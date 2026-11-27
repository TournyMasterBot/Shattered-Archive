// Phase 29a: the map window picks its world from the service the client is connected to (a local-only build; production has one world and no picker).
//   node world-map-worlds.mjs <out folder for screenshots>
// Against the dev game-client container (built with SIMULACRUM_ADMIN_LOCAL) and the local C# site on http://localhost:5000, which serves the DSL's proposed
// audited map at /api/world-map and the Simulacrum's map at /api/world-map/sandbox. The connection is simulated with the same events the client emits
// (game:remote-server:open / close with a host and a port); the page never connects to a game.
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const dispatch = (page, name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
const get = async (p) => (await fetch(`${SITE}/api/world-map${p}`)).json();

// real rooms of each world: one DSL room with a unique title, one Simulacrum room
const dslIndex = await get('/index');
const sandboxIndex = await get('/sandbox/index');
console.log(`  info: DSL map ${dslIndex.versionId} (${dslIndex.counts.rooms} rooms); Simulacrum map ${sandboxIndex.versionId} (${sandboxIndex.counts.rooms} rooms)`);
check('the two worlds are different maps', dslIndex.versionId !== sandboxIndex.versionId && dslIndex.counts.rooms > 20000 && sandboxIndex.counts.rooms < 1000);

const pickRoom = async (prefix, index) => {
  for (const area of index.areas.slice().sort((a, b) => b.rooms - a.rooms)) {
    const page = await get(`${prefix}/area/${area.id}?limit=300&offset=0`);
    for (const r of page.area.subzones.flatMap((s) => s.rooms)) {
      if (Object.keys(r.exits).length < 1) continue;
      const found = await get(`${prefix}/search?q=${encodeURIComponent(r.title)}`);
      if (found.total === 1) return { room: r, area };
    }
  }
  throw new Error(`no room with a unique title under ${prefix}`);
};
const dslPick = await pickRoom('', dslIndex);
const simPick = await pickRoom('/sandbox', sandboxIndex);
const rec = (r) => ({ room: r.title, sector: r.sector ?? 'city', exits: Object.keys(r.exits) });
console.log(`  info: DSL room "${dslPick.room.title}" in "${dslPick.area.name}"; Simulacrum room "${simPick.room.title}"`);

await withPage(APP, async (page) => {
  const seen = [];
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/world-map') && url.pathname !== '/api/health') return route.continue();
    seen.push(url.pathname);
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP);
  await page.waitForTimeout(2500);
  const win = page.getByRole('dialog', { name: 'Map' });
  const status = () => win.getByRole('status').innerText();
  const waitLocated = () => page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  const sandboxRequests = () => seen.filter((p) => p.startsWith('/api/world-map/sandbox')).length;
  const dslRequests = () => seen.filter((p) => p.startsWith('/api/world-map') && !p.startsWith('/api/world-map/sandbox')).length;

  // ---- connected to the DSL ----
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'dsl-mud.org', port: 4000, receivedTimestamp: 'x' });
  await dispatch(page, 'game:room-data', rec(dslPick.room));
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  await win.waitFor({ state: 'visible' });
  await waitLocated();
  check('connected to the DSL: the title is just Map and the player is on the DSL map', (await win.innerText()).includes('Map') && !/Simulacrum/.test(await win.innerText()) && (await win.innerText()).includes(dslPick.area.name), (await status()).slice(0, 40));
  check('connected to the DSL: only the public route was asked', dslRequests() > 0 && sandboxRequests() === 0, `${dslRequests()} public, ${sandboxRequests()} sandbox`);
  await page.screenshot({ path: path.join(OUT, 'phase-29a_dsl.png') });

  // ---- the client connects to the Simulacrum ----
  const before = seen.length;
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'simulacrum-server.shatteredarchive.dev', port: 65001, receivedTimestamp: 'x' });
  await win.getByText('Map · Simulacrum').waitFor({ timeout: 15000 });
  await dispatch(page, 'game:room-data', rec(simPick.room));
  await waitLocated();
  check('connected to the Simulacrum: the title names it and the player is on its map', (await win.innerText()).includes('Map · Simulacrum') && (await win.innerText()).includes('Walked so far'), (await status()).slice(0, 40));
  const newOnes = seen.slice(before);
  check('connected to the Simulacrum: only the local route was asked since the switch', newOnes.length > 0 && newOnes.every((p) => p.startsWith('/api/world-map/sandbox') || p === '/api/health'), newOnes.join(' ').slice(0, 120));
  check('nothing of the DSL map is on the Simulacrum window (no DSL area name)', !(await win.innerText()).includes(dslPick.area.name));
  await page.screenshot({ path: path.join(OUT, 'phase-29a_simulacrum.png') });

  // ---- the connection to another game (or a closed socket) is the DSL again ----
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'dsl-mud.org', port: 4000, receivedTimestamp: 'x' });
  await page.waitForFunction(() => !/Simulacrum/.test(document.querySelector('[role="dialog"][aria-label="Map"]')?.textContent ?? ''), null, { timeout: 15000 });
  await dispatch(page, 'game:room-data', rec(dslPick.room));
  await waitLocated();
  check('connected to the DSL again: the DSL map comes back', (await win.innerText()).includes(dslPick.area.name));
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'simulacrum-server.shatteredarchive.dev', port: 65001, receivedTimestamp: 'x' });
  await win.getByText('Map · Simulacrum').waitFor({ timeout: 15000 });
  await dispatch(page, 'game:remote-server:close', { type: 'socket-closed', payload: {} });
  await page.waitForFunction(() => !/Simulacrum/.test(document.querySelector('[role="dialog"][aria-label="Map"]')?.textContent ?? ''), null, { timeout: 15000 });
  check('the socket closing is the DSL (there is no picker, and a closed game has no world of its own)', !(await win.innerText()).includes('Simulacrum'));
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
