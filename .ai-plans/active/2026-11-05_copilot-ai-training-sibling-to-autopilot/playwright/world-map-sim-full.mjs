// The map window on the Simulacrum's FULL map (built from the game's own area files), against the running dev stack.
//   node world-map-sim-full.mjs <output png> [area id, default ma-midgaard]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const AREA = process.argv[3] ?? 'ma-midgaard';
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const dispatch = (page, name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
const get = async (p) => (await fetch(`${SITE}/api/world-map${p}`)).json();

const page0 = await get(`/sandbox/area/${AREA}?limit=400&offset=0`);
const rooms = page0.area.subzones.flatMap((s) => s.rooms);
const pick = rooms.filter((r) => Object.keys(r.exits).length >= 3)[Math.floor(rooms.length / 3)] ?? rooms[0];
console.log('area', AREA, 'rooms', rooms.length, 'player in', pick.title);

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
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'simulacrum-server.shatteredarchive.dev', port: 65001, receivedTimestamp: 'x' });
  await dispatch(page, 'game:room-data', { room: pick.title, sector: pick.sector ?? 'city', exits: Object.keys(pick.exits) });
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  await win.waitFor({ state: 'visible' });
  await win.getByText('Map · Simulacrum').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  await page.mouse.move(5, 5);
  await page.screenshot({ path: OUT });
});
