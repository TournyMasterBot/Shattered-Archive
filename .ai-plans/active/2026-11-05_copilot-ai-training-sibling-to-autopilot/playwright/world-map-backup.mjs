// Phase 44 UI + API check: the map's cloud backup. Two "devices" (two browser contexts, so two separate IndexedDB stores) share one throwaway local
// account. Device A explores five rooms and adds one by hand, signs in and presses Sync now; device B (empty) signs in with the same token, turns fog
// on, presses Sync now and gets the explored rooms back (the added room only as a count); Erase removes the account's copy. Runs against the dev stack's
// game client with the Simulacrum's world (no real connection: the page is told the connection opened and which room it is in).
//   NODE_USE_SYSTEM_CA=1 node world-map-backup.mjs <test-account.local.json> <out folder> [<showcase folder to copy into>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [CRED, OUT, SHOW] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
if (SHOW) fs.mkdirSync(SHOW, { recursive: true });
const cred = JSON.parse(fs.readFileSync(CRED, 'utf8'));
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
const HUT = 'Zz Surveyor Hut';
const TOKEN_KEY = 'shatteredArchive.auth.token';
const log = (t) => console.log(`[backup] ${t}`);
const checks = [];
const check = (name, ok) => (checks.push([name, ok]), log(`${ok ? 'PASS' : 'FAIL'} ${name}`));

const midgaard = (await (await fetch(`${SITE}/api/world-map/sandbox/area/ma-midgaard?limit=400&offset=0`)).json()).area;
const rooms = midgaard.subzones.flatMap((s) => s.rooms);
const unique = rooms.filter((r) => rooms.filter((o) => o.title === r.title).length === 1 && Object.keys(r.exits).length >= 2);
const walk = unique.slice(0, 5);
const neighbour = unique[5];
log(`walk: ${walk.map((r) => r.title).join(' > ')}`);

async function prepare(page) {
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const isMap = url.pathname.startsWith('/api/world-map') || url.pathname === '/api/health';
    const isUserContent = url.pathname.startsWith('/api/user-content');
    if (!isMap && !isUserContent) return route.continue();
    // the app (https) calls the site (http, another origin): answer the preflight and allow the origin, as the dev proxy does
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' } });
    }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const dispatch = (name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
  return {
    dispatch,
    connect: () => dispatch('game:remote-server:open', { type: 'socket-opened', host: 'simulacrum-server.shatteredarchive.dev', port: 65001, receivedTimestamp: 'x' }),
    enter: (r) => dispatch('game:room-data', { room: r.title, sector: r.sector ?? 'city', exits: Object.keys(r.exits) }),
    named: (n) => page.evaluate((name) => { window.__SA_IDENTITY__ = { characterName: name }; window.dispatchEvent(new CustomEvent('shatteredarchive:identity-updated', { detail: { characterName: name } })); }, n),
    visitKeys: () => page.evaluate(() => new Promise((resolve) => {
      const o = indexedDB.open('shatteredarchive-worldmap-mine');
      o.onerror = () => resolve([]);
      o.onsuccess = () => { const t = o.result.transaction('kv').objectStore('kv').getAllKeys(); t.onsuccess = () => resolve(t.result.filter((k) => String(k).startsWith('visit|'))); };
    })),
    openMap: async () => {
      await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
      await page.getByText('Map…', { exact: false }).first().click();
      const win = page.getByRole('dialog', { name: 'Map' });
      await win.waitFor({ state: 'visible' });
      return win;
    },
    tiles: () => page.locator('[data-testid="world-map-picture"] [data-room]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-room')))].length),
    resetStore: async () => {
      await page.goto(APP);
      await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.deleteDatabase('shatteredarchive-worldmap-mine'); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }));
      await page.evaluate(() => {
        localStorage.removeItem('shatteredarchive:worldmap:settings:v1');
        localStorage.setItem('shatteredarchive:worldmap:window:v1', JSON.stringify({ x: 560, y: 56, width: 560, height: 700 }));
      });
    },
  };
}

async function shot(page, name, showName, description) {
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, name) });
  if (SHOW && showName) {
    const saved = await saveShowcase(page, 'map-backup', showName.replace(/\.png$/, ''), { description });
    const file = typeof saved === 'string' ? saved : saved?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, showName));
  }
}

await withPage(APP, async (a) => {
  const browser = a.context().browser();
  const A = await prepare(a);

  // ---- device A: explore, add a room by hand, sign in ----
  await A.resetStore();
  await a.goto(APP);
  await a.waitForTimeout(2500);
  await A.connect();
  await A.named('Zzbackup-M');
  for (const r of walk) {
    await A.enter(r);
    await a.waitForTimeout(900);
  }
  // a room the map does not have, reached from a real one, then added from the panel
  await A.dispatch('game:room-data', { room: HUT, sector: 'inside', exits: ['N', 'S'] });
  await A.dispatch('shatteredarchive:command-sent', { text: 's' });
  await A.enter(neighbour);
  await a.waitForTimeout(1800);
  await A.dispatch('game:room-data', { room: HUT, sector: 'inside', exits: ['N', 'S'] });
  let win = await A.openMap();
  await a.waitForFunction(() => /not on the map/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  await win.getByRole('button', { name: 'Add this room…' }).click();
  const panel = win.getByRole('group', { name: 'Add a room' });
  await panel.getByText(/Filled in from what this browser has seen/).waitFor({ timeout: 10000 });
  await panel.getByRole('button', { name: 'Save room' }).click();
  await panel.waitFor({ state: 'detached', timeout: 10000 });
  await a.waitForTimeout(600);
  const keysA = await A.visitKeys();
  check(`device A recorded ${keysA.length} visits (six rooms walked, the hut is not on the map) under one character`, keysA.length >= 5 && keysA.every((k) => String(k).includes('|Zzbackup-M|')));

  // sign in through the site's real hand-off (popup replaced by a page of the same context: same localStorage)
  const login = await a.context().newPage();
  await login.goto(`${SITE}/user/game-sso/start?returnUrl=${encodeURIComponent(APP + 'auth-callback.html')}`);
  await login.locator('input:visible').nth(0).fill(cred.username);
  await login.locator('input[type="password"]:visible').first().fill(cred.password);
  await login.getByRole('button', { name: /log in/i }).first().click();
  await login.getByRole('button', { name: /^Continue as/ }).click();
  await login.waitForURL(/auth-callback\.html/, { timeout: 30000 });
  await login.waitForTimeout(1200);
  const stored = await login.evaluate((k) => localStorage.getItem(k), TOKEN_KEY);
  await login.close();
  check('the hand-off left a sign-in token in this browser', stored !== null);
  const token = JSON.parse(stored).token;

  // before signing in nothing is sent; here we are signed in: open the gear and sync
  await a.reload();
  await a.waitForTimeout(2000);
  await A.connect();
  await A.named('Zzbackup-M');
  await A.dispatch('game:room-data', { room: HUT, sector: 'inside', exits: ['N', 'S'] });
  win = await A.openMap();
  await win.getByRole('button', { name: 'Map settings' }).click();
  const requests = [];
  a.on('request', (r) => { if (r.url().includes('/api/user-content/map-visits')) requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await a.waitForTimeout(800);
  check('opening the map and the gear sends nothing to the backup route', requests.length === 0);
  await win.getByText('Cloud backup').waitFor();
  await win.getByRole('button', { name: 'Sync now' }).click();
  const resultA = win.getByTestId('map-backup-result');
  await resultA.waitFor({ state: 'visible', timeout: 15000 });
  const textA = ((await resultA.textContent()) ?? '').trim();
  log(`device A says: ${textA}`);
  check('device A: Backed up, with the explored rooms counted', /^Backed up\. Your account has \d+ explored rooms/.test(textA));
  check('device A: the room it added is counted', /1 room you added/.test(textA));
  check('device A: pressing Sync now made exactly one POST to the sync route', requests.filter((r) => r === 'POST /api/user-content/map-visits/sync').length === 1);
  await shot(a, 'phase-44_01-device-a-synced.png', 'showcase_13_map-backup-synced.png', 'The map window\u2019s gear: the Cloud backup section after Sync now on the first device, listing how many rooms the account holds.');
  const exploredA = Number(/has (\d+) explored/.exec(textA)?.[1] ?? 0);

  // ---- the site, as the API sees it (shape and counts only) ----
  const auth = { Authorization: `Bearer ${token}` };
  const anon = await fetch(`${SITE}/api/user-content/map-visits`);
  check(`API: anonymous GET is 401 (${anon.status})`, anon.status === 401);
  const got = await fetch(`${SITE}/api/user-content/map-visits`, { headers: auth });
  const doc = await got.json();
  const world = doc.worlds?.sandbox;
  log(`API: GET ${got.status}: worlds ${Object.keys(doc.worlds ?? {}).join(',')}; characters ${Object.keys(world?.visited ?? {}).length}; visited ${Object.values(world?.visited ?? {}).flat().length}; added ${world?.added?.length}`);
  check('API: GET answers the stored document (version 1, the one world, ids only)', got.status === 200 && doc.version === 1 && Object.keys(doc.worlds).join() === 'sandbox');
  check('API: the stored lists hold ids only (no title text anywhere)', !JSON.stringify(doc).includes(HUT) && !walk.some((r) => JSON.stringify(doc).includes(r.title)));
  const bad = await fetch(`${SITE}/api/user-content/map-visits/sync`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, worlds: { dsl: { added: ['Not An Id'] } } }) });
  const badBody = await bad.json();
  check(`API: a body with a bad room id is 400 with a reason (${bad.status}: ${String(badBody.error).slice(0, 50)})`, bad.status === 400 && /not a room id/.test(badBody.error));
  const after = await (await fetch(`${SITE}/api/user-content/map-visits`, { headers: auth })).json();
  check('API: the refused request changed nothing', JSON.stringify(after) === JSON.stringify(doc));

  // ---- device B: empty, same account ----
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  const B = await prepare(b);
  await b.goto(APP);
  await b.evaluate(([k, value]) => localStorage.setItem(k, value), [TOKEN_KEY, stored]);
  await B.resetStore();
  await b.goto(APP);
  await b.waitForTimeout(2500);
  await B.connect();
  await B.named('Zzbackup-M');
  await B.enter(walk[0]);
  await b.waitForTimeout(900);
  check('device B starts with one visit of its own', (await B.visitKeys()).length === 1);
  const winB = await B.openMap();
  await winB.getByRole('button', { name: 'Map settings' }).click();
  await winB.getByRole('radio', { name: /Rooms my account has visited/ }).check();
  await b.waitForTimeout(800);
  const fogBefore = await B.tiles();
  log(`device B with fog on, before syncing: ${fogBefore} room(s) drawn`);
  await winB.getByRole('button', { name: 'Sync now' }).click();
  const resultB = winB.getByTestId('map-backup-result');
  await resultB.waitFor({ state: 'visible', timeout: 15000 });
  const textB = ((await resultB.textContent()) ?? '').trim();
  log(`device B says: ${textB}`);
  check('device B: the explored rooms came back, the new ones counted', new RegExp(`has ${exploredA} explored rooms \\(\\d+ new here\\)`).test(textB));
  check('device B: the room added on the other device is counted, details staying there', /1 room you added, 1 on other devices \(their details stay there\)/.test(textB));
  await b.waitForTimeout(900);
  const keysB = await B.visitKeys();
  check(`device B now holds ${keysB.length} visit records (A's ${keysA.length}, including its own)`, keysB.length >= exploredA);
  const fogAfter = await B.tiles();
  log(`device B with fog on, after syncing: ${fogAfter} rooms drawn`);
  check('with fog on, the synced rooms are drawn on device B', fogAfter > fogBefore);
  await b.screenshot({ path: path.join(OUT, 'phase-44_02-device-b-restored.png') });
  await winB.getByRole('button', { name: 'Map settings' }).click(); // close the gear: the restored map is the picture
  await b.waitForTimeout(500);
  await shot(b, 'phase-44_02b-device-b-map.png', 'showcase_14_map-backup-restored.png', 'The same account on a second, empty device: after Sync now the explored rooms are back (fog of war shows them), the added room counted as living on another device.');

  // ---- erase, from device B ----
  await winB.getByRole('button', { name: 'Map settings' }).click();
  await winB.getByRole('button', { name: 'Erase my backup…' }).click();
  await b.waitForTimeout(300);
  await b.screenshot({ path: path.join(OUT, 'phase-44_03-erase-confirm.png') });
  check('erasing asks first', await winB.getByRole('button', { name: 'Yes, erase it' }).isVisible());
  await winB.getByRole('button', { name: 'Yes, erase it' }).click();
  await b.waitForFunction(() => /Backup erased/.test(document.querySelector('[data-testid="map-backup-result"]')?.textContent ?? ''), null, { timeout: 15000 });
  const empty = await (await fetch(`${SITE}/api/user-content/map-visits`, { headers: auth })).json();
  check('API: after Erase the account holds no worlds', Object.keys(empty.worlds).length === 0);
  check('erasing left device B\u2019s own record alone', (await B.visitKeys()).length === keysB.length);
  await b.screenshot({ path: path.join(OUT, 'phase-44_04-erased.png') });
  await ctxB.close();

  // ---- signed out: a clear message, nothing sent ----
  await a.evaluate((k) => localStorage.removeItem(k), TOKEN_KEY);
  await a.reload();
  await a.waitForTimeout(2000);
  await A.connect();
  await A.dispatch('game:room-data', { room: HUT, sector: 'inside', exits: ['N', 'S'] });
  const winOut = await A.openMap();
  await winOut.getByRole('button', { name: 'Map settings' }).click();
  const before = requests.length;
  await winOut.getByRole('button', { name: 'Sync now' }).click();
  await winOut.getByTestId('map-backup-result').waitFor({ timeout: 10000 });
  check('signed out: the window says to sign in', /Sign in to your Shattered Archive account/.test((await winOut.getByTestId('map-backup-result').textContent()) ?? ''));
  check('signed out: nothing was sent to the site', requests.length === before);
  await a.screenshot({ path: path.join(OUT, 'phase-44_05-signed-out.png') });
}, { headless: true });

const failed = checks.filter(([, ok]) => !ok);
log(`${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length === 0 ? 0 : 1);
