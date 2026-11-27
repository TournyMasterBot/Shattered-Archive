// The red "you are here" dot of the map window, on the real DSL map against the running dev stack: on by default when the player's place is known, a toggle button
// next to Centre on me, and the choice kept. Picks a room of a big area whose title is unique, puts the player there, and photographs the window with the dot and without.
//   node map-here-dot.mjs <out folder> [<showcase folder to copy into>]
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
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), console.log(`[here] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`));
const dispatch = (page, name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
const get = async (p) => (await fetch(`${SITE}/api/world-map${p}`)).json();

const index = await get('/index');
let pick = null;
for (const area of index.areas.slice().sort((a, b) => b.rooms - a.rooms).slice(0, 25)) {
  const page = await get(`/area/${area.id}?limit=300&offset=0`);
  const rooms = page.area.subzones.flatMap((s) => s.rooms);
  if (new Set(rooms.map((r) => r.coords?.z ?? 0)).size < 2) continue;
  for (const r of rooms.filter((x) => Object.keys(x.exits).length >= 2)) {
    const found = await get(`/search?q=${encodeURIComponent(r.title)}`);
    if (found.total === 1) {
      pick = r;
      break;
    }
  }
  if (pick) break;
}
if (!pick) throw new Error('no room with a unique title found');

const copy = (saved, name) => {
  const file = typeof saved === 'string' ? saved : saved?.path;
  if (SHOW && file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, name));
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
  await page.evaluate(() => localStorage.removeItem('shatteredarchive:worldmap:settings:v1'));
  await page.goto(APP);
  await page.waitForTimeout(2500);
  const win = page.getByRole('dialog', { name: 'Map' });
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'dsl-mud.org', port: 4000, receivedTimestamp: 'x' });
  await dispatch(page, 'game:room-data', { room: pick.title, sector: pick.sector ?? 'city', exits: Object.keys(pick.exits) });
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  await win.waitFor({ state: 'visible' });
  await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });

  const dots = win.locator('[data-you-are-here]');
  const toggle = win.getByRole('button', { name: 'Show where I am' });
  check('the window has a Show where I am button next to Centre on me', (await toggle.count()) === 1 && (await win.getByRole('button', { name: 'Centre on me' }).count()) === 1);
  check('the red dot is on by default once the player is located', (await dots.count()) >= 1 && (await toggle.getAttribute('aria-pressed')) === 'true', `${await dots.count()} dot(s)`);
  const fill = await dots.first().getAttribute('fill');
  check('the dot is red', fill === '#e5252a', fill ?? '');
  const onTile = await page.evaluate(() => {
    const dot = document.querySelector('[data-you-are-here]');
    const tile = document.querySelector(`[data-room="${dot.getAttribute('data-you-are-here')}"]`);
    const a = dot.getBoundingClientRect();
    const b = tile.getBoundingClientRect();
    return Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < 2 && Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < 2;
  });
  check('the dot sits on the middle of the player\'s room', onTile);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-53_here-dot-on.png') });
  if (SHOW) copy(await saveShowcase(page, 'world-map-here-dot', '01-dot-on', { description: 'The map window on the real DSL map with the red "you are here" dot on the player\'s room (on by default), and its toggle button, the red-dotted icon under Centre on me.' }), 'showcase_23_map-here-dot.png');

  await toggle.click();
  check('the button turns the dot off', (await dots.count()) === 0 && (await toggle.getAttribute('aria-pressed')) === 'false');
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-53_here-dot-off.png') });
  await page.reload();
  await page.waitForTimeout(2500);
  await dispatch(page, 'game:remote-server:open', { type: 'socket-opened', host: 'dsl-mud.org', port: 4000, receivedTimestamp: 'x' });
  await dispatch(page, 'game:room-data', { room: pick.title, sector: pick.sector ?? 'city', exits: Object.keys(pick.exits) });
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  await win.waitFor({ state: 'visible' });
  await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  check('the choice is kept after a reload (the dot stays off)', (await win.locator('[data-you-are-here]').count()) === 0 && (await win.getByRole('button', { name: 'Show where I am' }).getAttribute('aria-pressed')) === 'false');
  await win.getByRole('button', { name: 'Show where I am' }).click();
  check('and it comes back on', (await win.locator('[data-you-are-here]').count()) >= 1);
}, { headless: true });
console.log(`[here] ${checks.filter(Boolean).length}/${checks.length} checks pass`);
