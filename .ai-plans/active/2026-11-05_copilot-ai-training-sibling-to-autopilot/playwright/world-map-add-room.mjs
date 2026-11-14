// Phase 40 UI check: a room the map does not have is added from the map window, filed under a continent / area / subzone, kept in the browser
// (IndexedDB) and found again after a reload. Runs against the dev stack's game client with the Simulacrum's world (no real connection needed:
// the page is told the connection opened and which room it is in, the way the other map scripts do).
//   node world-map-add-room.mjs <out folder> [<showcase folder to copy into>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const SHOW = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
if (SHOW) fs.mkdirSync(SHOW, { recursive: true });
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
const HUT = 'Zz Surveyor Hut';
const get = async (p) => (await fetch(`${SITE}/api/world-map${p}`)).json();
const log = (t) => console.log(`[add-room] ${t}`);

const midgaard = await get('/sandbox/area/ma-midgaard?limit=400&offset=0');
const real = midgaard.area.subzones.flatMap((s) => s.rooms).find((r) => Object.keys(r.exits).length >= 2);
log(`neighbour in the map: "${real.title}"`);

const checks = [];
const check = (name, ok) => (checks.push([name, ok]), log(`${ok ? 'PASS' : 'FAIL'} ${name}`));

await withPage(APP, async (page) => {
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/world-map') && url.pathname !== '/api/health') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const dispatch = (name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
  const connect = () => dispatch('game:remote-server:open', { type: 'socket-opened', host: 'simulacrum-server.shatteredarchive.dev', port: 65001, receivedTimestamp: 'x' });
  const status = async () => ((await page.getByRole('dialog', { name: 'Map' }).locator('[role="status"]').first().textContent()) ?? '').trim();

  // start clean: nothing of an earlier run
  await page.goto(APP);
  await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.deleteDatabase('shatteredarchive-worldmap-mine'); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }));
  // a taller window than the default, so the whole form shows in the shots (the player can resize it the same way)
  await page.evaluate(() => localStorage.setItem('shatteredarchive:worldmap:window:v1', JSON.stringify({ x: 640, y: 56, width: 470, height: 640 })));
  await page.goto(APP);
  await page.waitForTimeout(2500);
  await connect();

  // 1. walk out of the hut into a real room, so the browser's own trail knows where the hut's south exit goes
  await dispatch('game:room-data', { room: HUT, sector: 'inside', exits: ['N', 'S'] });
  await dispatch('shatteredarchive:command-sent', { text: 's' });
  await dispatch('game:room-data', { room: real.title, sector: real.sector ?? 'city', exits: Object.keys(real.exits) });
  await page.waitForTimeout(1800); // the trail writes a moment after the last change
  // 2. back in the hut: not on the map
  await dispatch('game:room-data', { room: HUT, sector: 'inside', exits: ['N', 'S'] });

  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  const win = page.getByRole('dialog', { name: 'Map' });
  await win.waitFor({ state: 'visible' });
  await win.getByText('Map · Simulacrum').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => /not on the map/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  check('the status says the room is not on the map', /not on the map yet/.test(await status()));
  const add = win.getByRole('button', { name: 'Add this room…' });
  check('"Add this room…" is offered in the status bar', await add.isVisible());
  await page.screenshot({ path: path.join(OUT, 'phase-40_01-not-on-the-map.png') });

  // 3. the panel, filled from the browser's history
  await add.click();
  const panel = win.getByRole('group', { name: 'Add a room' });
  await panel.waitFor({ state: 'visible' });
  await panel.getByText(/Filled in from what this browser has seen/).waitFor({ timeout: 10000 });
  check('the panel says it was filled from this browser\'s history', true);
  check('the title is the hut', (await panel.getByLabel('Room title').inputValue()) === HUT);
  const south = panel.getByLabel('Exit S leads to');
  await south.waitFor();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Exit S leads to"]')?.options.length > 1, null, { timeout: 15000 });
  const options = await south.locator('option').allTextContents();
  check(`exit S offers the room it led to (${options.join(' | ')})`, options.some((o) => o.startsWith(real.title)));
  // the place is suggested from the room the exit leads to (the neighbour is in Midgaard): nothing is overridden
  const continent = panel.getByLabel('Continent');
  await page.waitForFunction(() => document.querySelector('select[aria-label="Subzone"]')?.value !== '__new__', null, { timeout: 10000 });
  const place = [await continent.inputValue(), await panel.getByLabel('Area').inputValue(), await panel.getByLabel('Subzone').inputValue()];
  log(`filed under ${place.join(' / ')}`);
  check('the area suggested is the one of the room the exit leads to', (await panel.getByLabel('Area').inputValue()) === 'ma-midgaard');
  check('world is shown as the Simulacrum, not chosen', (await panel.getByText('Simulacrum').count()) > 0 && (await panel.getByLabel('World').count()) === 0);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-40_02-add-panel.png') });
  if (SHOW) {
    const shot = await saveShowcase(page, 'map-add-room', '01-add-panel', { description: 'The map window\x27s add-a-room panel for a room the map does not have: filled in from the player\x27s own history, filed under a continent, an area and a subzone, with the room each exit leads to.' });
    const file = typeof shot === 'string' ? shot : shot?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_08_map-add-room-panel.png'));
  }

  // 4. save: the panel closes and the map places the player
  await panel.getByRole('button', { name: 'Save room' }).click();
  await panel.waitFor({ state: 'detached', timeout: 10000 });
  await page.waitForFunction(() => /You are here|probably here|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  check('after the save the window places the player', /You are|probably|One of/.test(await status()));
  await page.waitForTimeout(500);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-40_03-placed.png') });
  if (SHOW) {
    const shot = await saveShowcase(page, 'map-add-room', '02-placed', { description: 'After saving, the map places the player in the room they added (outlined), joined to the room its exit leads to.' });
    const file = typeof shot === 'string' ? shot : shot?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_09_map-add-room-placed.png'));
  }

  // 5. durable: the store holds it, and a reload finds it again
  const keys = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('shatteredarchive-worldmap-mine');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const tx = open.result.transaction('kv', 'readonly').objectStore('kv').getAllKeys(); tx.onsuccess = () => resolve(tx.result); };
  }));
  check(`IndexedDB holds the layer (${keys.filter((k) => !String(k).startsWith('trail|')).join(', ')})`, keys.includes('layer|sandbox'));
  check('IndexedDB holds the trail of rooms seen', keys.some((k) => String(k).startsWith('trail|sandbox|')));
  check('nothing is stored for the DSL world', !keys.includes('layer|dsl'));

  await page.goto(APP);
  await page.waitForTimeout(2500);
  await connect();
  await dispatch('game:room-data', { room: HUT, sector: 'inside', exits: ['N', 'S'] });
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  await win.waitFor({ state: 'visible' });
  await page.waitForFunction(() => /You are here|probably here|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 }).catch(async (e) => {
    log(`after the reload the status says: ${await status()}`);
    log(`layer: ${await page.evaluate(() => new Promise((resolve) => { const o = indexedDB.open('shatteredarchive-worldmap-mine'); o.onsuccess = () => { const t = o.result.transaction('kv').objectStore('kv').get('layer|sandbox'); t.onsuccess = () => resolve(JSON.stringify(t.result).slice(0, 900)); }; }))}`);
    await page.screenshot({ path: path.join(OUT, 'phase-40_debug.png') });
    throw e;
  });
  check('after a reload the added room is still found', /You are|probably|One of/.test(await status()));

  // 6. take it back, from the panel's list
  await win.getByRole('button', { name: 'Map settings' }).click();
  await win.getByRole('button', { name: 'Add a room by hand…' }).click();
  const hand = win.getByRole('group', { name: 'Add a room' });
  await hand.getByText('Rooms I added (1)').waitFor();
  await page.screenshot({ path: path.join(OUT, 'phase-40_04-by-hand-and-list.png') });
  await hand.getByRole('button', { name: `Remove ${HUT}` }).click();
  await hand.getByText(/Rooms I added/).waitFor({ state: 'detached' });
  check('Remove takes the room back out', true);
});

const failed = checks.filter(([, ok]) => !ok);
log(`${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length === 0 ? 0 : 1);
