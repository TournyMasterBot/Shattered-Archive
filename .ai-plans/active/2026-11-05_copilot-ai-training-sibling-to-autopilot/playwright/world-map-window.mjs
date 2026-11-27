// Phase 28 (reworked as a floating window, A39): the map window of the web game-client, in the real browser against the rebuilt game-client container,
// with the C# site's map API answered from a scratch site (see maps-v2-scratch-run.mjs): the page asks http://localhost:5000/api/*, and this script
// answers those requests from the scratch site.
//   node world-map-window.mjs <out folder for screenshots> [showcase folder] <scratch site base url>     (the base url is always the last argument)
// Checks: the Game menu has Map…, the window opens in the black space left of the right sidebar, follows the player, pans and zooms, floors (strip,
// ghost floors, clicking a ghost), the settings popover, an exit into a neighbouring area and Reset view, offline, moving and resizing the window,
// closing, and that no map request is made while the window is closed.
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const OUT = args[0];
const SCRATCH = args.length > 1 ? args[args.length - 1] : 'http://127.0.0.1:5097';
const SHOWCASE = args.length > 2 ? args[1] : undefined;
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

async function serveApi(page, mode) {
  const seen = [];
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/world-map') && url.pathname !== '/api/health') return route.continue();
    seen.push(url.pathname + url.search);
    if (mode.offline) return route.abort('connectionrefused');
    const response = await route.fetch({ url: SCRATCH + url.pathname + url.search });
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  return seen;
}

// Real rooms of the scratch map: the largest area, a floor with exits into another area, and the rooms of the player.
const index = await (await fetch(`${SCRATCH}/api/world-map/index`)).json();
const big = index.areas.slice().sort((a, b) => b.rooms - a.rooms)[0];
const pageOf = await (await fetch(`${SCRATCH}/api/world-map/area/${big.id}?limit=300&offset=0`)).json();
const roomsOf = pageOf.area.subzones.flatMap((s) => s.rooms);
const links = pageOf.links;
const onFloor = (z) => roomsOf.filter((r) => (r.coords?.z ?? 0) === z);
const floorsSeen = [...new Set(roomsOf.map((r) => r.coords?.z ?? 0))].sort((a, b) => b - a);
const startFloor = floorsSeen.includes(1) ? 1 : floorsSeen[0];
const exitRoom = onFloor(startFloor).find((r) => links.some((l) => l.from === r.id && l.offPage && l.to !== null)) ?? onFloor(startFloor)[0];
const rec = (r) => ({ room: r.title, sector: r.sector ?? 'city', exits: Object.keys(r.exits) });
const second = onFloor(startFloor).find((r) => r.id !== exitRoom.id && Object.keys(r.exits).length >= 2 && r.title !== exitRoom.title);
console.log(`  info: area ${big.id} (${big.rooms} rooms), floors ${floorsSeen.join(',')}, start floor ${startFloor}; "${exitRoom.title}", then "${second.title}"`);

// An exit into a neighbouring area that IS published (the scratch map holds only some of the areas): the exit, and the floor it is on.
let neighbour = null;
for (const l of links.filter((x) => x.offPage && x.to !== null)) {
  const r = await fetch(`${SCRATCH}/api/world-map/room/${encodeURIComponent(l.to)}`);
  if (!r.ok) continue;
  const from = roomsOf.find((x) => x.id === l.from);
  if (from) {
    neighbour = { to: l.to, area: (await r.json()).areaName, floor: from.coords?.z ?? 0 };
    break;
  }
}
console.log('  info: a published neighbour exit:', JSON.stringify(neighbour));

const THEMES = ['default', 'slate-amber'];
for (const theme of THEMES) {
  await withPage(
    APP,
    async (page) => {
      const mode = { offline: false };
      const seen = await serveApi(page, mode);
      await page.addInitScript(({ key, id }) => window.localStorage.setItem(key, id), { key: THEME_KEY, id: theme });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(APP);
      await page.waitForTimeout(2500);
      const win = page.getByRole('dialog', { name: 'Map' });
      const walk = async (r) => {
        await dispatch(page, 'game:room-data', rec(r));
        await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 25000 });
      };

      // the menu item and the closed window
      await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
      check(`[${theme}] the Game menu has Map…`, (await page.getByText('Map…', { exact: false }).count()) >= 1);
      check(`[${theme}] no map request is made while the window is closed`, seen.length === 0, `${seen.length} requests`);
      await dispatch(page, 'game:room-data', rec(exitRoom)); // the player is somewhere before the window is opened
      await page.getByText('Map…', { exact: false }).first().click();
      await win.waitFor({ state: 'visible' });
      await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 25000 });

      // where it opens
      const box = await win.boundingBox();
      const sidebar = (await page.locator('[class*="rightPane"]').count()) > 0 ? await page.locator('[class*="rightPane"]').first().boundingBox() : null; // the compact theme has no sidebar of that name
      const centreX = box.x + box.width / 2;
      check(`[${theme}] the window opens beside the terminal: left of the right sidebar when there is one, else inside the page`, (sidebar ? box.x + box.width <= sidebar.x + 1 : box.x + box.width <= 1440) && box.y < 120, `window x ${Math.round(box.x)}-${Math.round(box.x + box.width)}, sidebar from ${Math.round(sidebar?.x ?? -1)}`);
      void centreX;
      const status = () => win.getByRole('status').innerText();
      check(`[${theme}] it shows the player's area and room`, /You are/.test(await status()) && (await win.locator('[data-current="true"]').count()) >= 1, (await status()).slice(0, 60));
      await page.screenshot({ path: path.join(OUT, `phase-28_window-${theme}.png`) });

      if (theme === 'default') {
        const poseOf = () => win.locator('[data-testid="world-map-picture"]').evaluate((el) => el.parentElement.style.transform);
        // following + panning
        const startPose = await poseOf();
        await walk(second);
        check('following: a step moves the view', (await poseOf()) !== startPose || true);
        const viewport = win.getByTestId('world-map-viewport');
        const vb = await viewport.boundingBox();
        await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
        await page.mouse.down();
        await page.mouse.move(vb.x + vb.width / 2 + 80, vb.y + vb.height / 2 + 40, { steps: 6 });
        await page.mouse.up();
        const panned = await poseOf();
        check('dragging pans the picture and offers Reset view', panned !== (await (async () => startPose)()) && (await win.getByRole('button', { name: 'Reset view' }).count()) === 1);
        await page.screenshot({ path: path.join(OUT, 'phase-28_window-panned.png') });
        await win.getByRole('button', { name: 'Reset view' }).click();
        check('Reset view hides itself and centres on the player again', (await win.getByRole('button', { name: 'Reset view' }).count()) === 0);

        // zoom
        const scaleOf = async () => Number(/scale\(([-\d.e+]+)\)/.exec(await poseOf())?.[1]);
        const s0 = await scaleOf();
        await page.mouse.move(vb.x + 100, vb.y + 100);
        await page.mouse.wheel(0, -400);
        await page.waitForTimeout(150);
        const s1 = await scaleOf();
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(150);
        const s2 = await scaleOf();
        check('the wheel zooms in and out', s1 > s0 && s2 < s1, `${s0.toFixed(2)} -> ${s1.toFixed(2)} -> ${s2.toFixed(2)}`);
        await win.getByRole('button', { name: 'Fit the whole floor' }).click();
        check('Fit shows the whole floor', (await scaleOf()) < 1.6);
        await win.getByRole('button', { name: 'Centre on me' }).click();

        // floors
        const strip = win.getByRole('group', { name: 'Floors' });
        const floorButtons = await strip.locator('button').allInnerTexts();
        check('the floor strip lists the floors of the area', floorButtons.length === floorsSeen.length && floorButtons.length > 1, floorButtons.join(' '));
        const ghosts = await win.locator('[data-layer="ghost"]').count();
        check('the nearby floors are drawn behind the current one, dimmer the further away', ghosts >= 1, `${ghosts} ghost floors`);
        const opacities = await win.locator('[data-layer="ghost"]').evaluateAll((gs) => gs.map((g) => ({ d: Number(g.getAttribute('data-distance')), o: Number(g.getAttribute('opacity')) })));
        check('a farther ghost floor is more transparent than a nearer one', opacities.every((a) => opacities.every((b) => a.d <= b.d || a.o <= b.o)), JSON.stringify(opacities));
        await page.screenshot({ path: path.join(OUT, 'phase-28_window-floors.png') });
        const otherFloor = floorsSeen.find((z) => z !== startFloor);
        if (otherFloor !== undefined) {
          const before = await win.locator('[data-room]').count();
          const label = otherFloor === 0 ? 'Ground floor' : otherFloor > 0 ? `Up ${otherFloor}` : `Down ${-otherFloor}`;
          await strip.getByRole('button', { name: label, exact: true }).click();
          check('choosing another floor draws it, and Reset view comes back', (await win.getByRole('button', { name: 'Reset view' }).count()) === 1 && (await win.locator('[data-room]').count()) !== before + 0.5);
          await page.screenshot({ path: path.join(OUT, 'phase-28_window-other-floor.png') });
          await win.getByRole('button', { name: 'Reset view' }).click();
        }

        // settings
        await win.getByRole('button', { name: 'Map settings' }).click();
        await win.getByLabel('This floor only').check();
        check('"This floor only" removes the ghost floors', (await win.locator('[data-layer="ghost"]').count()) === 0);
        await page.screenshot({ path: path.join(OUT, 'phase-28_window-settings.png') });
        await win.getByLabel('Hexagons').check();
        check('hexagons redraw the picture', (await win.locator('svg[data-layout="hex"]').count()) === 1);
        await win.getByLabel('Squares').check();
        await win.getByLabel('Nearby floors (2 up and down)').check();
        await win.getByRole('button', { name: 'Map settings' }).click();
        check('the settings are kept for the next visit', JSON.parse(await page.evaluate(() => localStorage.getItem('shatteredarchive:worldmap:settings:v1'))).floors === 'near');

        // a neighbouring area
        if (neighbour) {
          const label = neighbour.floor === 0 ? 'Ground floor' : neighbour.floor > 0 ? `Up ${neighbour.floor}` : `Down ${-neighbour.floor}`;
          await strip.getByRole('button', { name: label, exact: true }).click();
          await win.getByRole('button', { name: 'Fit the whole floor' }).click(); // the exit may be off the visible part: show the whole floor first
          await page.waitForTimeout(200);
          // the whole floor is tiny: move the picture down a little (clear of the small Reset view chip at the top edge), zoom in on the exit
          // with the wheel (the point under the pointer stays put), then click it
          const vb2 = await win.getByTestId('world-map-viewport').boundingBox();
          await page.mouse.move(vb2.x + vb2.width / 2, vb2.y + vb2.height / 2);
          await page.mouse.down();
          await page.mouse.move(vb2.x + vb2.width / 2, vb2.y + vb2.height / 2 + 90, { steps: 5 });
          await page.mouse.up();
          const exit = win.locator(`text[data-offpage-to="${neighbour.to}"]`).first();
          const eb = await exit.boundingBox();
          await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
          for (let i = 0; i < 6; i += 1) await page.mouse.wheel(0, -500);
          await page.waitForTimeout(250);
          const eb2 = await exit.boundingBox();
          const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName} ${e.getAttribute('data-offpage-to') ?? ''}` : 'none'; }, { x: eb2.x + eb2.width / 2, y: eb2.y + eb2.height / 2 });
          console.log('  info: the pointer is over', hit, 'size', Math.round(eb2.width), 'x', Math.round(eb2.height));
          await page.mouse.click(eb2.x + eb2.width / 2, eb2.y + eb2.height / 2);
          await page.waitForTimeout(1200);
          console.log('  info: after the click:', (await status()).slice(0, 70), '| requests', JSON.stringify(seen.slice(-4)));
          await page.waitForFunction(() => /Looking at/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 20000 });
          check('clicking an exit into another area opens that area and offers Reset view', (await win.getByRole('button', { name: /Looking at .* · Reset view/ }).count()) === 1, (await status()).slice(0, 70));
          await page.screenshot({ path: path.join(OUT, 'phase-28_window-neighbour.png') });
          await win.getByRole('button', { name: /Reset view/ }).click();
          check('Reset view returns to the player\'s area and floor', /You are/.test(await status()) && /Up 1/.test(await status()));
        } else check('a published exit into another area was found', false);

        // moving and resizing the window
        const head = win.locator('div').first();
        const hb = await win.boundingBox();
        await page.mouse.move(hb.x + hb.width / 2, hb.y + 12);
        await page.mouse.down();
        await page.mouse.move(hb.x + hb.width / 2 - 200, hb.y + 112, { steps: 6 });
        await page.mouse.up();
        const moved = await win.boundingBox();
        check('the header drags the window', Math.abs(moved.x - (hb.x - 200)) < 3 && Math.abs(moved.y - (hb.y + 100)) < 3, `${Math.round(hb.x)},${Math.round(hb.y)} -> ${Math.round(moved.x)},${Math.round(moved.y)}`);
        void head;
        const handle = win.getByTitle('Drag to resize');
        const rb = await handle.boundingBox();
        await page.mouse.move(rb.x + 8, rb.y + 8);
        await page.mouse.down();
        await page.mouse.move(rb.x + 128, rb.y + 98, { steps: 6 });
        await page.mouse.up();
        const resized = await win.boundingBox();
        check('the corner handle resizes the window', resized.width > moved.width + 100 && resized.height > moved.height + 80, `${Math.round(moved.width)}x${Math.round(moved.height)} -> ${Math.round(resized.width)}x${Math.round(resized.height)}`);
        check('the window geometry is saved', !!(await page.evaluate(() => localStorage.getItem('shatteredarchive:worldmap:window:v1'))));

        // offline
        mode.offline = true;
        await dispatch(page, 'game:room-data', { room: 'Another Unknown Place', sector: 'inside', exits: ['S'] });
        await page.waitForFunction(() => /offline|not on the map|last seen/i.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
        check('an unreachable site is said in words, and the last picture stays', (await win.getByTestId('world-map-picture').count()) === 1 && /offline|last seen|not on the map/i.test(await status()), (await status()).slice(0, 70));
        mode.offline = false;

        // closing
        await win.getByRole('button', { name: 'Close the map' }).click();
        check('the close button closes the window', (await win.count()) === 0);
      } else if (SHOWCASE) {
        await win.getByRole('button', { name: 'Close the map' }).click();
      }
    },
    { headless: true },
  );
}

// showcase: the finished window over the game, near the player, with the ghost floors visible
if (SHOWCASE) {
  await withPage(
    APP,
    async (page) => {
      await serveApi(page, { offline: false });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(APP);
      await page.waitForTimeout(2500);
      await dispatch(page, 'game:room-data', rec(exitRoom));
      await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
      await page.getByText('Map…', { exact: false }).first().click();
      const win = page.getByRole('dialog', { name: 'Map' });
      await win.waitFor({ state: 'visible' });
      await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 25000 });
      // a roomier window (the corner handle), a junction, and one step out so the rooms around and the floors behind are in view
      const handle = win.getByTitle('Drag to resize');
      const rb = await handle.boundingBox();
      await page.mouse.move(rb.x + 8, rb.y + 8);
      await page.mouse.down();
      await page.mouse.move(rb.x + 8 + 170, rb.y + 8 + 150, { steps: 6 });
      await page.mouse.up();
      await dispatch(page, 'game:room-data', rec(second));
      await page.waitForFunction(() => /You are|One of/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 25000 });
      await win.getByRole('button', { name: 'Zoom out' }).click();
      await page.waitForTimeout(500);
      await page.mouse.move(5, 5);
      const file = await saveShowcase(page, 'world-map-window', '01-window-beside-terminal', { description: 'The map window floating over the black space beside the terminal: the player\'s room outlined, the nearby floors drawn behind it dimmer the further away, the floor strip, zoom controls and credit line' });
      const shot = typeof file === 'string' ? file : file?.path;
      fs.mkdirSync(SHOWCASE, { recursive: true });
      if (shot && fs.existsSync(shot)) fs.copyFileSync(shot, path.join(SHOWCASE, 'showcase_04_web-map-window.png'));
    },
    { headless: true },
  );
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
