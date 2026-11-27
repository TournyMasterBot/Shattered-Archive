// Phase 39 items (Phases 37, 40, 44), the parts that need only the browser and the local stack:
//   1. the visit recorder's request load: how many map requests does the app itself make while rooms are entered with the window CLOSED?
//   2. a large store: a 24,400-room backup restored into an empty browser through the real sync, then read back after a reload (IndexedDB with tens of thousands of keys).
// Numbers go to the console; one screenshot shows the restored map with fog on. The throwaway local account's backup is erased at the end.
//   NODE_USE_SYSTEM_CA=1 node world-map-load.mjs <test-account.local.json> <out folder>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [CRED, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const cred = JSON.parse(fs.readFileSync(CRED, 'utf8'));
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
const TOKEN_KEY = 'shatteredArchive.auth.token';
const IDB = 'shatteredarchive-worldmap-mine';
const log = (t) => console.log(`[load] ${t}`);
const checks = [];
const check = (name, ok) => (checks.push([name, ok]), log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
const get = async (p) => (await fetch(`${SITE}/api/world-map/sandbox${p}`)).json();

const index = await get('/index');
const uniqueRooms = async (areaId, count) => {
  const area = (await get(`/area/${areaId}?limit=300&offset=0`)).area;
  const rooms = area.subzones.flatMap((s) => s.rooms);
  return rooms.filter((r) => rooms.filter((o) => o.title === r.title).length === 1 && Object.keys(r.exits).length >= 1).slice(0, count);
};
const walkOne = await uniqueRooms('ma-midgaard', 25);
const walkTwo = await uniqueRooms('ma-shire', 15);
const walkThree = await uniqueRooms('ma-haon', 15);
log(`walks: ${walkOne.length} + ${walkTwo.length} + ${walkThree.length} rooms in three areas`);
const midgaardIds = (await get('/area/ma-midgaard?limit=300&offset=0')).area.subzones.flatMap((s) => s.rooms.map((r) => r.id));

async function prepare(page) {
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const ok = url.pathname.startsWith('/api/world-map') || url.pathname === '/api/health' || url.pathname.startsWith('/api/user-content');
    if (!ok) return route.continue();
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
    visitCount: () => page.evaluate((db) => new Promise((resolve) => {
      const o = indexedDB.open(db);
      o.onerror = () => resolve(0);
      o.onsuccess = () => { const t = o.result.transaction('kv').objectStore('kv').getAllKeys(); t.onsuccess = () => resolve(t.result.filter((k) => String(k).startsWith('visit|')).length); };
    }), IDB),
    openMap: async () => {
      await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
      await page.getByText('Map…', { exact: false }).first().click();
      const win = page.getByRole('dialog', { name: 'Map' });
      await win.waitFor({ state: 'visible' });
      return win;
    },
    tiles: () => page.locator('[data-testid="world-map-picture"] [data-room]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-room')))].length),
    reset: async () => {
      await page.goto(APP);
      await page.evaluate((db) => new Promise((resolve) => { const r = indexedDB.deleteDatabase(db); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }), IDB);
      await page.evaluate(() => {
        localStorage.removeItem('shatteredarchive:worldmap:settings:v1');
        localStorage.setItem('shatteredarchive:worldmap:window:v1', JSON.stringify({ x: 560, y: 56, width: 560, height: 700 }));
      });
    },
  };
}

await withPage(APP, async (a) => {
  const browser = a.context().browser();
  const A = await prepare(a);

  // ---- 1. the request load of the recorder, window closed ----
  await A.reset();
  const seen = [];
  a.on('request', (r) => { if (r.url().startsWith(SITE)) seen.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await a.goto(APP);
  await a.waitForTimeout(2500);
  const startup = seen.length;
  await A.connect();
  await A.named('Zzload-M');
  const walks = [walkOne, walkTwo, walkThree];
  const perWalk = [];
  for (const walk of walks) {
    const before = seen.length;
    for (const room of walk) {
      await A.enter(room);
      await a.waitForTimeout(350);
    }
    await a.waitForTimeout(600);
    perWalk.push([walk.length, seen.length - before]);
  }
  const total = seen.length - startup;
  const distinct = new Set(seen.slice(startup)).size;
  const roomsEntered = walks.reduce((n, w) => n + w.length, 0);
  const areaReads = seen.slice(startup).filter((s) => /\/area\//.test(s));
  log(`window closed, ${roomsEntered} rooms entered in three areas: ${total} map requests (${distinct} distinct); ${startup} requests before connecting`);
  log(`per area walk [rooms, requests]: ${perWalk.map((p) => `[${p.join(', ')}]`).join(' ')}`);
  log(`area page requests: ${areaReads.length} (distinct ${new Set(areaReads).size}); other: ${seen.slice(startup).filter((s) => !/\/area\//.test(s)).map((s) => s.replace(/\/sandbox/, '')).slice(0, 6).join(' | ')}`);
  check('every area page was asked for at most once (the session keeps areas in memory)', areaReads.length === new Set(areaReads).size);
  check(`entering ${roomsEntered} rooms cost fewer map requests than rooms entered (${total} < ${roomsEntered})`, total < roomsEntered);
  const recorded = await A.visitCount();
  check(`the recorder wrote ${recorded} visit records for ${roomsEntered} rooms (certain matches only)`, recorded > 0 && recorded <= roomsEntered);

  // ---- 2. a large store through the real sync ----
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
  const token = JSON.parse(stored).token;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  await fetch(`${SITE}/api/user-content/map-visits`, { method: 'DELETE', headers: auth });

  const TOTAL = 24400;
  const ids = [...midgaardIds];
  for (let i = 0; ids.length < TOTAL; i += 1) ids.push(`azah-load-${String(i).padStart(6, '0')}`);
  const doc = { version: 1, worlds: { sandbox: { visited: { 'Zzload-M': ids }, added: [] } } };
  const body = JSON.stringify(doc);
  const t0 = Date.now();
  const seeded = await fetch(`${SITE}/api/user-content/map-visits/sync`, { method: 'POST', headers: auth, body });
  log(`seeded the account with ${ids.length} room ids (${(body.length / 1024).toFixed(0)} KiB): POST ${seeded.status} in ${Date.now() - t0} ms`);
  check('the site accepts a 24,400-room world (200)', seeded.status === 200);

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  const B = await prepare(b);
  await b.goto(APP);
  await b.evaluate(([k, value]) => localStorage.setItem(k, value), [TOKEN_KEY, stored]);
  await B.reset();
  await b.goto(APP);
  await b.waitForTimeout(2500);
  await B.connect();
  await B.named('Zzload-M');
  await B.enter(walkOne[0]);
  await b.waitForTimeout(900);
  const win = await B.openMap();
  await win.getByRole('button', { name: 'Map settings' }).click();
  await win.getByRole('radio', { name: /Rooms my account has visited/ }).check();
  const clickAt = Date.now();
  await win.getByRole('button', { name: 'Sync now' }).click();
  const result = win.getByTestId('map-backup-result');
  await result.waitFor({ state: 'visible', timeout: 120000 });
  const restoreMs = Date.now() - clickAt;
  const text = ((await result.textContent()) ?? '').trim();
  log(`restore: ${text} (${restoreMs} ms from the click to the result)`);
  check(`the restore reports ${TOTAL} explored rooms`, new RegExp(`has ${TOTAL.toLocaleString('en-US')}|has ${TOTAL} `).test(text) || text.includes('24,400'));
  const stable = await (async () => {
    let last = -1;
    for (let i = 0; i < 40; i += 1) {
      const n = await B.visitCount();
      if (n === last && n >= TOTAL) return n;
      last = n;
      await b.waitForTimeout(500);
    }
    return last;
  })();
  log(`IndexedDB now holds ${stable} visit records`);
  check(`IndexedDB holds all ${TOTAL} visit records after the restore`, stable >= TOTAL);

  await win.getByRole('button', { name: 'Map settings' }).click();
  await b.waitForTimeout(800);
  const shown = await B.tiles();
  log(`fog on (account level): ${shown} rooms drawn from ${stable} records`);
  check('with the restored record, fog shows the explored rooms of the area', shown >= 20);
  await b.mouse.move(5, 5);
  await b.screenshot({ path: path.join(OUT, 'phase-39_44-restored-24k.png') });

  // a reload: how long until the 24,400 records are read and the fog applied
  await b.reload();
  await b.waitForTimeout(500);
  const reloadAt = Date.now();
  await b.waitForFunction(() => !!document.querySelector('[class*="menuItem"]'), null, { timeout: 30000 });
  await B.connect();
  await B.named('Zzload-M');
  await B.enter(walkOne[0]);
  const win2 = await B.openMap();
  await b.waitForFunction(() => document.querySelectorAll('[data-testid="world-map-picture"] [data-room]').length > 10, null, { timeout: 60000 });
  const reloadMs = Date.now() - reloadAt;
  log(`after a reload, the fog map with ${stable} stored visits was drawn ${reloadMs} ms after the page loaded (includes the page start and the connection steps)`);
  check('after a reload the stored visits are read and the fog map is drawn within 20 s', reloadMs < 20000);
  const count2 = await B.visitCount();
  check('the reload kept every record', count2 === stable);
  void win2;
  await ctxB.close();

  await fetch(`${SITE}/api/user-content/map-visits`, { method: 'DELETE', headers: auth });
  const gone = await (await fetch(`${SITE}/api/user-content/map-visits`, { headers: auth })).json();
  check('the throwaway account\u2019s backup was erased again', Object.keys(gone.worlds).length === 0);
}, { headless: true });

const failed = checks.filter(([, ok]) => !ok);
log(`${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length === 0 ? 0 : 1);
