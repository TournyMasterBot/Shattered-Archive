// Phase 37 UI check: fog of war on the map window, against the dev stack's game client with the Simulacrum's world (no real connection: the page is
// told the connection opened and which room it is in, like the other map scripts). Exploration is recorded in IndexedDB as rooms are entered.
//   node world-map-fog.mjs <out folder> [<showcase folder to copy into>]
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
const log = (t) => console.log(`[fog] ${t}`);
const checks = [];
const check = (name, ok) => (checks.push([name, ok]), log(`${ok ? 'PASS' : 'FAIL'} ${name}`));

// a walk of five rooms of Midgaard: rooms whose title is unique in the area and that have at least two exits
const area = (await (await fetch(`${SITE}/api/world-map/sandbox/area/ma-midgaard?limit=400&offset=0`)).json()).area;
const rooms = area.subzones.flatMap((s) => s.rooms);
const unique = rooms.filter((r) => rooms.filter((o) => o.title === r.title).length === 1 && Object.keys(r.exits).length >= 2);
const walk = unique.slice(0, 5);
log(`walk: ${walk.map((r) => r.title).join(' > ')}`);

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
  const enter = (r) => dispatch('game:room-data', { room: r.title, sector: r.sector ?? 'city', exits: Object.keys(r.exits) });
  const named = (name) => page.evaluate((n) => { window.__SA_IDENTITY__ = { characterName: n }; window.dispatchEvent(new CustomEvent('shatteredarchive:identity-updated', { detail: { characterName: n } })); }, name);
  const rooms_ = () => page.locator('[data-testid="world-map-picture"] [data-room]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-room')))].length);
  const visitKeys = () => page.evaluate(() => new Promise((resolve) => {
    const o = indexedDB.open('shatteredarchive-worldmap-mine');
    o.onerror = () => resolve([]);
    o.onsuccess = () => { const t = o.result.transaction('kv').objectStore('kv').getAllKeys(); t.onsuccess = () => resolve(t.result.filter((k) => String(k).startsWith('visit|'))); };
  }));
  const openMap = async () => {
    await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await page.getByText('Map…', { exact: false }).first().click();
    const win = page.getByRole('dialog', { name: 'Map' });
    await win.waitFor({ state: 'visible' });
    return win;
  };

  // clean start: no earlier visits; fog off (the default)
  await page.goto(APP);
  await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.deleteDatabase('shatteredarchive-worldmap-mine'); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }));
  await page.evaluate(() => { localStorage.removeItem('shatteredarchive:worldmap:settings:v1'); localStorage.setItem('shatteredarchive:worldmap:window:v1', JSON.stringify({ x: 640, y: 56, width: 520, height: 600 })); });
  await page.goto(APP);
  await page.waitForTimeout(2500);
  await connect();
  await named('Zzfog-M');

  // 1. walk five rooms with the window closed: visits are recorded anyway (the owner asked to record always)
  for (const r of walk) {
    await enter(r);
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(500);
  const keys = await visitKeys();
  check(`five rooms entered with the map closed and fog off: ${keys.length} visit records (all under the character)`, keys.length === 5 && keys.every((k) => String(k).includes('|Zzfog-M|')));
  check('the records hold ids only (no titles in the keys)', keys.every((k) => !walk.some((r) => String(k).includes(r.title))));

  // 2. fog off: the whole area
  const win = await openMap();
  await page.waitForFunction(() => /You are here|probably here|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const all = await rooms_();
  check(`fog off (default): the whole floor is drawn (${all} rooms)`, all > 15);
  check('no eye while fog is off', (await win.getByRole('button', { name: /Fog of war is on/ }).count()) === 0);
  await page.screenshot({ path: path.join(OUT, 'phase-37_01-fog-off.png') });

  // 3. the character level
  await win.getByRole('button', { name: 'Map settings', exact: true }).click();
  check('the gear offers Off, account and character; Off is chosen', (await win.getByRole('radio', { name: 'Off (show everything)' }).isChecked()));
  await win.getByRole('radio', { name: 'Rooms this character has visited' }).check();
  await page.waitForTimeout(500);
  const mine = await rooms_();
  check(`fog at the character level: only what Zzfog-M visited is drawn (${mine} rooms)`, mine > 0 && mine <= 5 + 1);
  check('the eye appears in the header', (await win.getByRole('button', { name: /Fog of war is on: Rooms this character has visited/ }).count()) === 1);
  await page.mouse.move(5, 5);
  await win.getByRole('button', { name: 'Map settings', exact: true }).click(); // close the popover for the picture
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'phase-37_02-fog-character.png') });
  if (SHOW) {
    const shot = await saveShowcase(page, 'map-fog-of-war', '01-character-level', { description: 'The map window with fog of war at the character level: only the rooms this character has walked are drawn, with the exits that lead on shown as unknown stubs; the small eye in the header says fog is on.' });
    const file = typeof shot === 'string' ? shot : shot?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_10_map-fog-of-war.png'));
  }

  // 4. another character of the same account: the character level starts empty, the account level keeps the walk
  await named('Zzother-F');
  await page.waitForTimeout(500);
  const other = await rooms_();
  check(`another character sees only the room it stands in (${other} rooms)`, other <= 1 + 1);
  await win.getByRole('button', { name: 'Map settings', exact: true }).click();
  await win.getByRole('radio', { name: 'Rooms my account has visited' }).check();
  await page.waitForTimeout(500);
  const account = await rooms_();
  check(`the account level keeps the first character's walk (${account} rooms)`, account === mine);

  // 5. it is all still there after a reload (IndexedDB), and the setting too
  await page.goto(APP);
  await page.waitForTimeout(2500);
  await connect();
  await named('Zzfog-M');
  await enter(walk[2]);
  const win2 = await openMap();
  await page.waitForFunction(() => /You are here|probably here|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const after = await rooms_();
  check(`after a reload the fog setting and the visits are still there (${after} rooms, fog on)`, after === mine && (await win2.getByRole('button', { name: /Fog of war is on/ }).count()) === 1);
  await win2.getByRole('button', { name: 'Map settings', exact: true }).click();
  await win2.getByRole('radio', { name: 'Off (show everything)' }).check();
  await page.waitForTimeout(500);
  check('switching fog off shows the whole floor again', (await rooms_()) > 15);
  await page.screenshot({ path: path.join(OUT, 'phase-37_03-fog-off-again.png') });
});

const failed = checks.filter(([, ok]) => !ok);
log(`${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length === 0 ? 0 : 1);
