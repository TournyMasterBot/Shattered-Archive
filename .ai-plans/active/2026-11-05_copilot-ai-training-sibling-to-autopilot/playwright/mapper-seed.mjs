// Phase 22: the Mapper, moved into the monorepo, driven like a person against its Vite dev server (the owner starts it:
// `pnpm --filter @shatteredarchive/shattered-maps-client dev`, http://localhost:22080). Imports the seed document through the app's own
// Import control, checks the editor, the hexagon view and the octagon view against the seed, and the JSON and SVG exports.
//   node mapper-seed.mjs <out folder for screenshots> [base url]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:22080';
fs.mkdirSync(OUT, { recursive: true });
const SEED = 'C:/Projects/ShatteredArchive/apps/shattered-maps-client/seed_data/mapdoc.json';
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const rooms = Object.values(seed.rooms);

// the largest area's biggest floor, found the same way the unit test finds it
const byAreaFloor = new Map();
for (const r of rooms) {
  const key = `${r.category.worldId}|${r.category.continentId}|${r.category.areaId}|${r.coords.vz ?? 0}`;
  byAreaFloor.set(key, (byAreaFloor.get(key) ?? 0) + 1);
}
const [bigKey, bigCount] = [...byAreaFloor.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
const [worldId, continentId, areaId, floorText] = bigKey.split('|');
const floor = Number(floorText);
const floor0 = rooms.filter((r) => (r.coords.vz ?? 0) === 0).length;
// the room with the most exits in that area and floor: the focus of the hexagon view
const inBig = rooms.filter((r) => r.category.areaId === areaId && (r.coords.vz ?? 0) === floor);
const focus = inBig.sort((a, b) => Object.keys(b.exits).length - Object.keys(a.exits).length || a.vnum.localeCompare(b.vnum))[0];

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// since Phase 23 the classic editor (what this script drives) is at #/legacy; the neutral viewer is the home page (mapper-neutral.mjs)
await withPage(
  `${BASE}/#/legacy`,
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const dialogs = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.accept();
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.waitForLoadState('networkidle');
    check('the editor loads with its title', (await page.title()).includes('Game Mapping'), await page.title());

    // import the seed through the persistence bar's file control
    await page.locator('input[type="file"]').setInputFiles(SEED);
    await page.waitForFunction(() => localStorage.getItem('dslmapper.autosave') !== null, null, { timeout: 15000 });
    check('the import reported success', dialogs.some((m) => m.includes('Import complete')), dialogs.join(' | '));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dslmapper.autosave') ?? '{}'));
    check('the autosave holds all 176 seed rooms', Object.keys(saved.rooms ?? {}).length === 176, String(Object.keys(saved.rooms ?? {}).length));
    check('and the catalog of 8 continents', Object.keys(saved.meta?.catalog?.continents ?? {}).length === 8);
    await page.screenshot({ path: path.join(OUT, 'phase-22_editor.png') });

    // the JSON export downloads the document
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Export JSON' }).click()]);
    const jsonPath = await download.path();
    const exported = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    check('Export JSON downloads mapdoc-*.json with 176 rooms', /^mapdoc-.*\.json$/.test(download.suggestedFilename()) && Object.keys(exported.rooms).length === 176, download.suggestedFilename());

    // the SVG export of the current area and level (may need an area selected: reported, not required)
    const svgButton = page.getByRole('button', { name: /Export SVG/i }).first();
    if ((await svgButton.count()) > 0) {
      const attempt = await Promise.race([
        page.waitForEvent('download', { timeout: 4000 }).then((d) => ({ d })),
        svgButton.click().then(() => new Promise((resolve) => setTimeout(() => resolve({ none: true }), 4500))),
      ]).catch(() => ({ none: true }));
      if (attempt.d) {
        const text = fs.readFileSync(await attempt.d.path(), 'utf8');
        check('Export SVG downloads an svg', text.includes('<svg') && /\.svg$/.test(attempt.d.suggestedFilename()), attempt.d.suggestedFilename());
      } else {
        console.log('INFO Export SVG gave no download from the editor with nothing selected (it exports the selected area)');
      }
    }

    // the hexagon view of one room: the focus room is drawn, with its label
    await page.goto(`${BASE}/#/map/room/${encodeURIComponent(focus.vnum)}?level=${floor}`);
    await page.waitForSelector('svg polygon', { timeout: 15000 });
    const hex = await page.locator('svg polygon').count();
    check(`the hexagon view of room "${focus.label}" draws exactly the ${bigCount} rooms of its area and floor`, hex === bigCount, `${hex} of ${bigCount}`);
    const hexTitles = await page.locator('svg text.hex__label title').allTextContents();
    check('and has the focus room among them, with its full name in the tooltip', hexTitles.includes(focus.label), focus.label);
    check('and no two tiles sit at the same place', (await page.locator('svg polygon').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('points'))).size)) === bigCount);
    check('and the focus tile is highlighted', (await page.locator('svg g.hex--focus').count()) === 1);
    await page.screenshot({ path: path.join(OUT, 'phase-22_seed-hex.png') });

    // the hexagon AREA route draws that one area and floor, not every room of the floor
    await page.goto(`${BASE}/#/map/${encodeURIComponent(continentId)}/${encodeURIComponent(areaId)}?level=${floor}`);
    await page.waitForSelector('svg polygon', { timeout: 15000 });
    const all = await page.locator('svg polygon').count();
    check(`the hexagon area route draws the ${bigCount} rooms of the area (not the ${floor0} rooms of every area on floor 0)`, all === bigCount, String(all));
    await page.screenshot({ path: path.join(OUT, 'phase-22_seed-hex-area.png') });

    // the octagon view of the largest area and floor
    await page.goto(`${BASE}/#/renderer/${worldId}/${continentId}/${areaId}?level=${floor}`);
    await page.waitForSelector('svg', { timeout: 15000 });
    await page.waitForTimeout(500);
    const oct = await page.locator('svg polygon').count();
    check(`the octagon view draws the ${bigCount} rooms of the largest area's floor ${floor}`, oct >= bigCount, String(oct));
    await page.screenshot({ path: path.join(OUT, 'phase-22_seed-oct.png') });

    check('no page error and no console error during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
  },
  { contextOptions: { acceptDownloads: true } },
);

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
