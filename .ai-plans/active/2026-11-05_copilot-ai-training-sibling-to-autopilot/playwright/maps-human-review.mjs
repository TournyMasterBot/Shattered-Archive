// Looks at the C# world-map page the way a person would: continents, the three maze areas the owner named (the Great Library, the
// Spirit World, Machine Dreams), floors, stairs, badges, off-page arrows, drag/wheel/keys, and the selected room staying marked. Saves a screenshot of each
// state to look at; the checks are only the things a script can see (counts, positions, that nothing overlaps).
//   node maps-human-review.mjs <out folder>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5000';
const log = (t) => console.log(`[review] ${t}`);
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` \u2014 ${detail}` : ''}`));

await withPage(`${BASE}/maps/world-v2`, async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  const shot = (name) => page.screenshot({ path: path.join(OUT, `phase-49_${name}.png`) });
  const ready = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('wm2-status')?.textContent ?? ''), re, { timeout: 40000 });
  const open = async (c, a) => {
    await page.goto(`${BASE}/maps/world-v2#c=${c}&a=${a}`);
    await page.reload();
    await ready(a ? 'rooms' : 'areas on');
    await page.waitForTimeout(600);
  };
  const surface = page.locator('#wm2-surface');
  const view = async () => surface.evaluate((s) => ({ left: s.scrollLeft, top: s.scrollTop }));

  // ---- continents ----
  await open('az-c411', '');
  const boxes = await page.evaluate(() => {
    const out = [...document.querySelectorAll('#wm2-surface svg [data-area]')].map((e) => e.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < out.length; i += 1)
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i], b = out[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps += 1;
      }
    return { count: out.length, overlaps };
  });
  check('Arkane: no two area boxes overlap', boxes.overlaps === 0, `${boxes.count} areas`);
  await shot('continent-arkane-squares');
  check('there is no tile-shape choice: the Tiles select is gone and an area is a box', (await page.locator('#wm2-layout').count()) === 0 && (await page.locator('#wm2-surface svg rect[data-area]').count()) > 50 && (await page.locator('#wm2-surface svg polygon[data-area]').count()) === 0);
  await open('az-c409', '');
  await shot('continent-althainia');
  const althainia = await page.evaluate(() => {
    const out = [...document.querySelectorAll('#wm2-surface svg [data-area]')].map((e) => e.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < out.length; i += 1)
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i], b = out[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps += 1;
      }
    return { count: out.length, overlaps };
  });
  check('Althainia: no two area boxes overlap', althainia.overlaps === 0, `${althainia.count} areas`);

  // ---- the Great Library ----
  await open('az-c411', 'az-a229');
  const library = await page.evaluate(() => {
    const svg = document.querySelector('#wm2-surface svg');
    return { tangles: Number(svg.getAttribute('data-tangles') || 0), badges: svg.querySelectorAll('[data-tangled]').length, landings: 0, pills: svg.querySelectorAll('[data-pill]').length };
  });
  check('Great Library: a chip on the edge of each tangled exit, pills, and no trace until a room is chosen', library.badges > 10 && library.pills > 0 && (await page.locator('#wm2-surface svg [data-layer="trace"]').count()) === 0, JSON.stringify(library));
  await shot('library-open');
  // do any two room name labels or badges overlap a tile that is not theirs? count text/tile overlaps among tiles and name lines
  const clash = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('#wm2-surface svg polygon[data-room]')].map((p) => ({ id: p.getAttribute('data-room'), r: p.getBoundingClientRect() }));
    const names = [...document.querySelectorAll('#wm2-surface svg text[fill="#222"]')].map((t) => t.getBoundingClientRect());
    let bad = 0;
    for (const n of names) for (const t of tiles) if (n.left < t.r.right - 1 && t.r.left < n.right - 1 && n.top < t.r.bottom - 1 && t.r.top < n.bottom - 1) bad += 1;
    const badges = [...document.querySelectorAll('#wm2-surface svg [data-tangled]')].map((g) => g.getBoundingClientRect());
    let badgeOnName = 0;
    for (const b of badges) for (const n of names) if (b.left < n.right - 1 && n.left < b.right - 1 && b.top < n.bottom - 1 && n.top < b.bottom - 1) badgeOnName += 1;
    return { nameOnTile: bad, badgeOnName };
  });
  check('Great Library: no room name sits on a tile, no badge on a name', clash.nameOnTile === 0 && clash.badgeOnName === 0, JSON.stringify(clash));

  // click a maze room: its tangled exits are drawn out to where they land (and only its), the room is ringed and its details shown
  const mazeRoom = page.locator('#wm2-surface svg polygon[data-kind="maze"]').nth(8);
  const mazeId = await mazeRoom.getAttribute('data-room');
  await mazeRoom.scrollIntoViewIfNeeded();
  await mazeRoom.click({ force: true });
  await page.waitForTimeout(500);
  const traced = await page.locator('#wm2-surface svg [data-layer="trace"] [data-trace-to]').count();
  const expectedExits = await page.locator(`#wm2-surface svg [data-tangled-from="${mazeId}"]`).count();
  check('clicking a maze room draws a line from each of its tangled exits to where it lands', traced > 0 && traced === expectedExits, `${traced} lines, ${expectedExits} exits`);
  check('and rings the room and shows its details', (await page.locator(`#wm2-surface svg [data-selected-ring="${mazeId}"]`).count()) === 1 && !(await page.locator('#wm2-room').isHidden()));
  await shot('library-trace');
  // click a chip: jumps to its target room and rings it
  const firstBadge = page.locator('#wm2-surface svg [data-tangled]').first();
  const targetId = await firstBadge.getAttribute('data-jump-to');
  await firstBadge.scrollIntoViewIfNeeded();
  await firstBadge.hover();
  await page.waitForTimeout(1300);
  await shot('library-badge-hover');
  await firstBadge.click();
  await page.waitForTimeout(500);
  check('clicking a badge selects and rings the room it leads to', (await page.locator(`#wm2-surface svg [data-selected-ring="${targetId}"]`).count()) === 1 && !(await page.locator('#wm2-room').isHidden()), targetId);
  await shot('library-badge-clicked');

  // drag, wheel, keys
  const v0 = await view();
  await page.mouse.move(700, 500);
  await page.mouse.down();
  await page.mouse.move(560, 430, { steps: 6 });
  await page.mouse.up();
  const v1 = await view();
  check('dragging the map moves it', Math.abs(v1.left - v0.left) > 40 || Math.abs(v1.top - v0.top) > 40, `${JSON.stringify(v0)} -> ${JSON.stringify(v1)}`);
  check('a drag does not clear the selected room', (await page.locator('#wm2-surface svg [data-selected-ring]').count()) === 1);
  const w0 = await page.locator('#wm2-surface svg').evaluate((s) => s.getBoundingClientRect().width);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const w1 = await page.locator('#wm2-surface svg').evaluate((s) => s.getBoundingClientRect().width);
  check('the wheel zooms in', w1 > w0 * 1.1, `${Math.round(w0)} -> ${Math.round(w1)}`);
  await surface.focus();
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  const w2 = await page.locator('#wm2-surface svg').evaluate((s) => s.getBoundingClientRect().width);
  check('the minus key zooms out', w2 < w1 * 0.8, `${Math.round(w1)} -> ${Math.round(w2)}`);
  const v2 = await view();
  await page.keyboard.press('ArrowRight');
  check('an arrow key pans', (await view()).left !== v2.left || (await surface.evaluate((s) => s.scrollWidth <= s.clientWidth)));
  await page.keyboard.press('Escape');
  check('Escape clears the selection', (await page.locator('#wm2-surface svg [data-selected-ring]').count()) === 0 && (await page.locator('#wm2-room').isHidden()));

  // ---- the Spirit World and Machine Dreams ----
  await open('az-c413', 'az-a401');
  await shot('spirit-world');
  await open('az-c409', 'az-a155');
  await shot('machine-dreams');

  // ---- stairs and floors: an area with several floors ----
  await open('az-c410', 'az-a325');
  const floorsBefore = await page.locator('#wm2-floor').innerText();
  const upButton = page.locator('#wm2-floor-up');
  const downButton = page.locator('#wm2-floor-down');
  check('the floor has on-screen Up and Down buttons with its name between', (await upButton.count()) === 1 && (await downButton.count()) === 1 && /\(\d+ of \d+\)/.test(floorsBefore), floorsBefore);
  const stairs = await page.locator('#wm2-surface svg [data-stairs]').count();
  check('stairs are drawn as up and down triangles', stairs > 0, `${stairs} on this floor`);
  await shot('floor-stairs');
  const down = page.locator('#wm2-surface svg [data-stairs="down"][data-stairs-to]').first();
  if (await down.count()) {
    const goes = await down.locator('title').textContent();
    check('a staircase says which room it goes to', /^Down: .+/.test(goes ?? ''), goes ?? '');
    await down.click();
    await page.waitForTimeout(500);
    const after = await page.locator('#wm2-floor').innerText();
    check('clicking a staircase changes the floor and rings the room it reaches', after !== floorsBefore && (await page.locator('#wm2-surface svg [data-selected-ring]').count()) === 1, `${floorsBefore} -> ${after}`);
    await shot('floor-after-stairs');
  }
  const beforeStep = await page.locator('#wm2-floor').innerText();
  if (!(await upButton.isDisabled())) await upButton.click();
  else if (!(await downButton.isDisabled())) await downButton.click();
  await page.waitForTimeout(300);
  check('the floor buttons step one floor', (await page.locator('#wm2-floor').innerText()) !== beforeStep);
  await page.keyboard.press('PageUp');

  // ---- an exit that leaves the area ----
  await open('az-c411', 'az-a229');
  const away = page.locator('#wm2-surface svg [data-offpage-to]').first();
  if (await away.count()) {
    await away.scrollIntoViewIfNeeded();
    await away.hover();
    await page.waitForTimeout(1500);
    const hint = await away.locator('title').textContent();
    check('hovering an exit out of the area names the area it leads to', /^Leads to /.test(hint ?? ''), hint ?? '');
    const here = page.url();
    await away.click();
    await ready('rooms');
    await page.waitForTimeout(800);
    check('clicking it opens the next area with the arrival room selected', page.url() !== here && (await page.locator('#wm2-surface svg [data-selected-ring]').count()) === 1, page.url());
    await shot('offpage-arrived');
  } else log('no off-page exit on the Great Library floor shown: skipped');

  // ---- every room is an octagon (eight sides) ----
  await open('az-c411', 'az-a229');
  const sides = await page.evaluate(() => [...document.querySelectorAll('#wm2-surface svg polygon[data-room]')].map((p) => p.getAttribute('points').trim().split(/\s+/).length));
  check('every room tile has eight sides', sides.length > 20 && sides.every((n) => n === 8), `${sides.length} tiles`);
  await shot('library-octagons');
  // ---- the continent: areas laid out by their exits, lines with arrows between them, boxes that start small and open whole ----
  await open('az-c411', '');
  const lines = await page.locator('#wm2-surface svg g[data-area-link]').count();
  const tips = await page.locator('#wm2-surface svg g[data-area-link] polygon').count();
  check('the continent draws a line between areas that an exit joins, with arrowheads', lines > 40 && tips >= lines, `${lines} lines, ${tips} arrowheads`);
  const hover = await page.locator('#wm2-surface svg g[data-area-link] title').first().textContent();
  check('a line says which way the exits go', /to .+: (north|northeast|east|southeast|south|southwest|west|northwest|up|down)/.test(hover ?? ''), hover ?? '');
  const sizes = await page.evaluate(() => [...document.querySelectorAll('#wm2-surface svg rect[data-area]')].map((r) => Number(r.getAttribute('width'))).sort((a, b) => a - b));
  check('the boxes keep their relative sizes and none is huge (largest under 360 px at life size)', sizes.length > 50 && sizes[sizes.length - 1] < 360 && sizes[sizes.length - 1] > 3 * sizes[0], `${sizes[0]}..${sizes[sizes.length - 1]} px`);
  const fits = await page.evaluate(() => {
    const surface = document.getElementById('wm2-surface');
    const svg = surface.querySelector('svg');
    const box = svg.getBoundingClientRect();
    const frame = surface.getBoundingClientRect();
    return box.height <= frame.height + 2 && box.width <= frame.width + 2;
  });
  check('the whole continent opens inside the card, nothing starts out of view', fits);
  await shot('continent-lines');
  // clicking the middle of the biggest box lands on its name: the click must reach the box (found on the phone, where tapping a box did nothing)
  const biggest = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('#wm2-surface svg rect[data-area]')];
    const size = (r) => Number(r.getAttribute('width')) * Number(r.getAttribute('height'));
    return boxes.reduce((best, r, i) => (size(r) > size(boxes[best]) ? i : best), 0);
  });
  await page.locator('#wm2-surface svg rect[data-area]').nth(biggest).click();
  await page.waitForFunction(() => /a=/.test(window.location.hash), null, { timeout: 15000 }).catch(() => {});
  check('clicking the middle of a continent box (on its name) opens that area', /a=/.test(await page.evaluate(() => window.location.hash)));
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' '));
}, { headless: true });

log(`${checks.filter(Boolean).length}/${checks.length} checks pass`);
process.exit(checks.every(Boolean) ? 0 : 1);
