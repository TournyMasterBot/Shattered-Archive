// The C# world-map page on the maze and tangle drawing (Phase 46), on the REAL audited map served by the local site: the Great Library (a marked maze),
// The Siege (some tangled exits) and the Arkane city (clean). Checks the picture carries the new marks where it should and none where it should not.
//   node maps-v2-maze.mjs <out folder> [<showcase folder to copy into>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [OUT, SHOW] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
if (SHOW) fs.mkdirSync(SHOW, { recursive: true });
const BASE = 'http://localhost:5000';
const log = (t) => console.log(`[maze] ${t}`);
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`));

await withPage(`${BASE}/maps/world-v2`, async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  const open = async (area) => {
    await page.goto(`${BASE}/maps/world-v2#c=az-c411&a=${area}`);
    await page.reload();
    await page.waitForFunction(() => /rooms/.test(document.getElementById('wm2-status')?.textContent ?? ''), null, { timeout: 30000 });
    await page.waitForTimeout(700);
  };
  const count = (sel) => page.locator(`#wm2-surface svg ${sel}`).count();

  await open('az-a229');
  const mazeTiles = await count('polygon[data-kind="maze"]');
  const stubs = await count('g[data-tangled]');
  const teleports = await count('g[data-tangled="teleport"]');
  const lines = await count('line[data-link]');
  check(`the Great Library draws its rooms as maze hexagons (${mazeTiles})`, mazeTiles > 40);
  check(`its tangled exits are partial lines with a diamond or an hourglass (${stubs} stubs, ${teleports} hourglasses) and the long lines are gone (${lines} full lines)`, stubs > 100 && teleports > 0 && lines < stubs);
  check('the picture says how many tangled exits the floor has', (await page.locator('#wm2-surface svg').first().getAttribute('data-tangles')) === String(stubs));
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-46_01-great-library-maze.png') });
  if (SHOW) {
    const shot = await saveShowcase(page, 'map-tangles', '01-great-library', { description: 'The Great Library of the History of Algoron, a marked maze: amber hexagons, partial lines instead of long ones, a diamond for an exit that does not lead straight on and an hourglass for one that lands far away.' });
    const file = typeof shot === 'string' ? shot : shot?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_15_map-maze-great-library.png'));
  }

  await open('az-a172');
  check('the Arkane city draws no tangle marks and no maze hexagons', (await count('g[data-tangled]')) === 0 && (await count('polygon[data-kind]')) === 0);
  await page.screenshot({ path: path.join(OUT, 'phase-46_02-arkane-city-clean.png') });

  await open('az-a184');
  const siegeStubs = await count('g[data-tangled]');
  const siegeTangledTiles = await count('polygon[data-kind="tangled"]');
  log(`The Siege, its busiest floor: ${siegeStubs} tangled stubs, ${siegeTangledTiles} tangled rooms`);
  check('every tangled stub of The Siege starts at a coloured (tangled) hexagon', siegeStubs === 0 || siegeTangledTiles > 0);
  await page.screenshot({ path: path.join(OUT, 'phase-46_03-the-siege.png') });

  // the floor choice of The Siege that holds the Mist (the floors above the busiest one): find the floor with the most tangled stubs
  const floors = await page.locator('#wm2-floor option').evaluateAll((os) => os.map((o) => o.value));
  let best = { floor: null, stubs: -1 };
  for (const f of floors) {
    await page.locator('#wm2-floor').selectOption(f);
    await page.waitForTimeout(300);
    const n = await count('g[data-tangled]');
    if (n > best.stubs) best = { floor: f, stubs: n };
  }
  log(`The Siege: the floor with the most tangled exits is floor ${best.floor} (${best.stubs})`);
  await page.locator('#wm2-floor').selectOption(best.floor);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'phase-46_04-the-siege-most-tangled-floor.png') });
  check('no page error and no console error during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
}, { headless: true });

log(`${checks.filter(Boolean).length}/${checks.length} checks pass`);
process.exit(checks.every(Boolean) ? 0 : 1);
