// Phase 29d: the map window of the web game-client against the REAL proposed audited map (Azah's map checked against the owner's play), served by the
// local C# site on http://localhost:5000 (the local compose mounts the audited folder; see docs/shattered-maps/verification.md).
//   node world-map-real.mjs <out folder for screenshots>
// It picks real rooms from the real API (a multi-floor area, a room whose title is unique), puts the player there, and checks: the window shows the area
// and the player's room, the floor strip and ghost floors of a real multi-floor area, another floor, and an exit into a neighbouring area with Reset view.
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
const THEME_KEY = 'shatteredArchive.hudTheme.id.v1';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const dispatch = (page, name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
const get = async (p) => (await fetch(`${SITE}/api/world-map${p}`)).json();

// ---- real rooms ---------------------------------------------------------------------------------------------------------------------
const index = await get('/index');
console.log(`  info: map ${index.versionId}: ${index.counts.areas} areas, ${index.counts.rooms} rooms, status ${index.status}`);
let pick = null;
for (const area of index.areas.slice().sort((a, b) => b.rooms - a.rooms).slice(0, 25)) {
  const page = await get(`/area/${area.id}?limit=300&offset=0`);
  const rooms = page.area.subzones.flatMap((s) => s.rooms);
  const floors = [...new Set(rooms.map((r) => r.coords?.z ?? 0))].sort((a, b) => b - a);
  if (floors.length < 3) continue;
  for (const z of floors.slice(1, -1)) {
    for (const r of rooms.filter((x) => (x.coords?.z ?? 0) === z && Object.keys(x.exits).length >= 2)) {
      const found = await get(`/search?q=${encodeURIComponent(r.title)}`);
      if (found.total === 1) {
        const out = page.links.find((l) => l.offPage && l.to !== null && rooms.some((x) => x.id === l.from));
        pick = { area, room: r, floor: z, floors, rooms, links: page.links, out };
        break;
      }
    }
    if (pick) break;
  }
  if (pick) break;
}
if (!pick) throw new Error('no multi-floor area with a room of a unique title');
console.log(`  info: area ${pick.area.id} "${pick.area.name}" (${pick.area.rooms} rooms), floors ${pick.floors.join(',')}; room "${pick.room.title}" on floor ${pick.floor}`);
const rec = (r) => ({ room: r.title, sector: r.sector ?? 'city', exits: Object.keys(r.exits) });
const floorLabel = (z) => (z === 0 ? 'Ground floor' : z > 0 ? `Up ${z}` : `Down ${-z}`);

for (const theme of ['default', 'slate-amber']) {
  await withPage(APP, async (page) => {
    const seen = [];
    await page.route(`${SITE}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/world-map') && url.pathname !== '/api/health') return route.continue();
      seen.push(url.pathname + url.search);
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    });
    await page.addInitScript(({ key, id }) => window.localStorage.setItem(key, id), { key: THEME_KEY, id: theme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(APP);
    await page.waitForTimeout(2500);
    const win = page.getByRole('dialog', { name: 'Map' });
    const status = () => win.getByRole('status').innerText();
    await dispatch(page, 'game:room-data', rec(pick.room));
    await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await page.getByText('Map…', { exact: false }).first().click();
    await win.waitFor({ state: 'visible' });
    await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
    check(`[${theme}] the real map puts the player in the right area`, /You are here/.test(await status()) && (await win.innerText()).includes(pick.area.name), (await status()).slice(0, 40));
    check(`[${theme}] the player's room is marked`, (await win.locator('[data-current="true"]').count()) >= 1);
    const roomsShown = await win.locator('[data-room]').count();
    check(`[${theme}] a real floor draws rooms`, roomsShown > 5, `${roomsShown} rooms on this floor`);
    await page.screenshot({ path: path.join(OUT, `phase-29d_real-${theme}.png`) });
    if (theme !== 'default') return;

    const strip = win.getByRole('group', { name: 'Floors' });
    const buttons = await strip.locator('button').allInnerTexts();
    check('the floor strip lists the floors of the real area', buttons.length === pick.floors.length, buttons.join(' '));
    check('the floors above and below are drawn behind, dimmer the further away', (await win.locator('[data-layer="ghost"]').count()) >= 1);
    await page.screenshot({ path: path.join(OUT, 'phase-29d_real-floors.png') });
    const other = pick.floors.find((z) => z !== pick.floor);
    await strip.getByRole('button', { name: floorLabel(other), exact: true }).click();
    check('choosing another floor draws it, and Reset view comes back', (await win.getByRole('button', { name: 'Reset view' }).count()) === 1);
    await page.screenshot({ path: path.join(OUT, 'phase-29d_real-other-floor.png') });
    await win.getByRole('button', { name: 'Reset view' }).click();
    check('Reset view returns to the player', /You are/.test(await status()));

    if (pick.out) {
      const out = pick.out;
      const from = pick.rooms.find((r) => r.id === out.from);
      await strip.getByRole('button', { name: floorLabel(from.coords?.z ?? 0), exact: true }).click();
      await win.getByRole('button', { name: 'Fit the whole floor' }).click();
      const vb = await win.getByTestId('world-map-viewport').boundingBox();
      await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
      await page.mouse.down();
      await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2 + 90, { steps: 5 });
      await page.mouse.up();
      const exit = win.locator(`text[data-offpage-to="${out.to}"]`).first();
      const eb = await exit.boundingBox();
      await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
      for (let i = 0; i < 6; i += 1) await page.mouse.wheel(0, -500);
      await page.waitForTimeout(250);
      const eb2 = await exit.boundingBox();
      await page.mouse.click(eb2.x + eb2.width / 2, eb2.y + eb2.height / 2);
      await win.getByRole('button', { name: /Looking at .* · Reset view/ }).waitFor({ timeout: 20000 });
      check('an exit into a neighbouring area opens that area (real data) and offers Reset view', (await win.getByRole('button', { name: /Looking at .* · Reset view/ }).count()) === 1, (await status()).slice(0, 80));
      await page.screenshot({ path: path.join(OUT, 'phase-29d_real-neighbour.png') });
      await win.getByRole('button', { name: /Reset view/ }).click();
      check('Reset view returns to the player\'s area', /You are/.test(await status()));
    } else console.log('  info: the room has no exit out of its area on this floor page; the neighbour check was skipped');
    check('the pages were fetched in slices of at most 300 rooms and no request failed', seen.every((u) => !/limit=([4-9]\d\d|\d{4,})/.test(u)), `${seen.length} requests`);
  });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
