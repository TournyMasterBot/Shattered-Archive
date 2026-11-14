// Final showcase of the map window on REAL data (the DSL's proposed audited map, and the Simulacrum's own map in a dev build), against the running dev stack.
//   node world-map-showcase-real.mjs <showcase folder to copy into>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
fs.mkdirSync(OUT, { recursive: true });
const dispatch = (page, name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
const get = async (p) => (await fetch(`${SITE}/api/world-map${p}`)).json();

const index = await get('/index');
let pick = null;
for (const area of index.areas.slice().sort((a, b) => b.rooms - a.rooms).slice(0, 25)) {
  const page = await get(`/area/${area.id}?limit=300&offset=0`);
  const rooms = page.area.subzones.flatMap((s) => s.rooms);
  const floors = [...new Set(rooms.map((r) => r.coords?.z ?? 0))];
  if (floors.length < 3) continue;
  for (const r of rooms.filter((x) => Object.keys(x.exits).length >= 2)) {
    const found = await get(`/search?q=${encodeURIComponent(r.title)}`);
    if (found.total === 1) {
      pick = r;
      break;
    }
  }
  if (pick) break;
}
const sim = await get('/sandbox/index');
const simRoom = (await get(`/sandbox/area/${sim.areas[0].id}?limit=300&offset=0`)).area.subzones.flatMap((s) => s.rooms).find((r) => Object.keys(r.exits).length >= 1);

const copy = async (file, name) => {
  const shot = typeof file === 'string' ? file : file?.path;
  if (shot && fs.existsSync(shot)) fs.copyFileSync(shot, path.join(OUT, name));
};
await withPage(APP, async (page) => {
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/world-map') && url.pathname !== '/api/health') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP);
  await page.waitForTimeout(2500);
  const win = page.getByRole('dialog', { name: 'Map' });
  const located = () => page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'dsl-mud.org', port: 4000, receivedTimestamp: 'x' });
  await dispatch(page, 'game:room-data', { room: pick.title, sector: pick.sector ?? 'city', exits: Object.keys(pick.exits) });
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  await win.waitFor({ state: 'visible' });
  await located();
  await page.mouse.move(5, 5);
  await copy(await saveShowcase(page, 'world-map-window-real', '01-dsl-real-map', { description: 'The map window on the real DSL map: Azah\'s map checked against play, the player\'s room outlined, the floor strip and the nearby floors dimmer behind; solid lines are exits the owner\'s play confirmed.' }), 'showcase_05_real-dsl-map.png');

  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'simulacrum-server.shatteredarchive.dev', port: 65001, receivedTimestamp: 'x' });
  await win.getByText('Map · Simulacrum').waitFor({ timeout: 15000 });
  await dispatch(page, 'game:room-data', { room: simRoom.title, sector: simRoom.sector ?? 'inside', exits: Object.keys(simRoom.exits) });
  await located();
  await page.mouse.move(5, 5);
  await copy(await saveShowcase(page, 'world-map-window-real', '02-simulacrum-map', { description: 'The same window while the client is connected to the Simulacrum: its own map, titled Map · Simulacrum (a development build only).' }), 'showcase_06_simulacrum-map.png');
});
