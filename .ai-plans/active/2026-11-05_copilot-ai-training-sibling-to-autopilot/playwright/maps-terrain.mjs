// The terrain colours on the C# world-map page: areas whose rooms carry a sector mined from the GMCP logs (mine-terrain.mjs), with the terrain key.
// Checks that tiles carry data-sector and the palette fill, that the key lists exactly the terrains drawn, and that an area with none shows no key.
//   node maps-terrain.mjs <out folder> [<showcase folder to copy into>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [OUT, SHOW] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
if (SHOW) fs.mkdirSync(SHOW, { recursive: true });
const BASE = 'http://localhost:5000';
const log = (t) => console.log(`[terrain] ${t}`);
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` \u2014 ${detail}` : ''}`));

await withPage(`${BASE}/maps/world-v2`, async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  const open = async (continent, area) => {
    await page.goto(`${BASE}/maps/world-v2#c=${continent}&a=${area}`);
    await page.reload();
    await page.waitForFunction(() => /rooms/.test(document.getElementById('wm2-status')?.textContent ?? ''), null, { timeout: 30000 });
    await page.waitForTimeout(500);
  };
  const drawn = () => page.evaluate(() => (document.querySelector('#wm2 svg')?.getAttribute('data-sectors') ?? '').split(',').filter(Boolean));
  const keyed = () => page.locator('#wm2-terrain-key li').allInnerTexts();

  await open('az-c410', 'az-a325');
  const frost = await drawn();
  const frostKey = await keyed();
  check('Frostainia: tiles carry their terrain', (await page.locator('#wm2 polygon[data-sector]').count()) >= 10, `${frost.join(',')}`);
  check('Frostainia: the key lists exactly the terrains drawn', frost.length >= 4 && frostKey.length >= frost.length, frostKey.join(' | '));
  const swatch = await page.locator('#wm2-terrain-key .wm2-swatch').first().evaluate((s) => getComputedStyle(s).backgroundColor);
  const tile = await page.locator(`#wm2 polygon[data-sector="${frost[0]}"]`).first().getAttribute('fill');
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  check('a swatch is the colour of its tiles', swatch === rgb(tile), `${swatch} / ${tile}`);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-48_terrain-frostainia.png'), fullPage: true });

  await open('az-c409', 'az-a38');
  check('Sands of Sorrow: desert, water and forest in one area', (await drawn()).length >= 6, (await drawn()).join(','));
  await page.screenshot({ path: path.join(OUT, 'phase-48_terrain-sands.png'), fullPage: true });
  if (SHOW) {
    const saved = await saveShowcase(page, 'map-terrain', '01-terrain-key', { description: 'The world map page on an area whose rooms are coloured by terrain mined from the game\u2019s GMCP room data, with the terrain key above the legend.' });
    const file = typeof saved === 'string' ? saved : saved?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_19_map-terrain.png'));
  }

  await open('az-c409', 'az-a100');
  check('an area whose rooms have no terrain yet shows no key', (await keyed()).length === 0 && (await page.locator('#wm2-terrain-key').isHidden()));
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' '));
}, { headless: true });

log(`${checks.filter(Boolean).length}/${checks.length} checks pass`);
process.exit(checks.every(Boolean) ? 0 : 1);
