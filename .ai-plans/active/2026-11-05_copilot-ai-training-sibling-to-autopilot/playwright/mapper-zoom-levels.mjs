// The Mapper (neutral viewer) exercised at every zoom level on the REAL audited DSL map: world (several continents in one file) > continent (Arkane) >
// area > zone (subzone) > room, plus the neighbours of a room. Builds two files in a scratch folder (never the repository): the whole Arkane continent merged
// from the audited slices, and a "world" file with the six largest areas of every continent.
//   node mapper-zoom-levels.mjs <out folder> <scratch folder> [base url]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { validateMapFile } from 'file:///C:/Projects/ShatteredArchive/services/shattered-maps-core/dist/index.js';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [OUT, SCRATCH, BASE = 'http://127.0.0.1:22081'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });
const AUDITED = 'C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/copilot-server/world-map/audited';
const log = (t) => console.log(`[mapper-zoom] ${t}`);
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`));

const manifest = JSON.parse(fs.readFileSync(path.join(AUDITED, 'manifest.json'), 'utf8'));
const read = (entry) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(AUDITED, entry.file))));
const entries = manifest.areas;
log(`audited manifest: ${entries.length} areas`);

function merge(selected) {
  const map = { version: 1, generatedAt: manifest.publishedAt ?? '2026-11-12', continents: [], links: [] };
  for (const entry of selected) {
    const part = read(entry);
    const c = part.continents[0];
    let into = map.continents.find((x) => x.id === c.id);
    if (!into) map.continents.push((into = { id: c.id, name: c.name, areas: [] }));
    into.areas.push(...c.areas);
    map.links.push(...part.links);
  }
  return map;
}

const arkaneEntries = entries.filter((a) => /arkan/i.test(a.continentName ?? '') || a.continentId === 'az-c411');
const arkane = merge(arkaneEntries);
const arkaneRooms = arkane.continents[0].areas.reduce((n, a) => n + a.subzones.reduce((m, s) => m + s.rooms.length, 0), 0);
const valid = validateMapFile(arkane);
log(`Arkane merged: ${arkane.continents[0].areas.length} areas, ${arkaneRooms} rooms; strict reader: ${valid.ok ? 'ok' : JSON.stringify(valid.errors?.slice(0, 2))}`);
const arkanePath = path.join(SCRATCH, 'arkane.json');
fs.writeFileSync(arkanePath, JSON.stringify(arkane));

const byContinent = new Map();
for (const e of entries) byContinent.set(e.continentId, [...(byContinent.get(e.continentId) ?? []), e]);
const worldEntries = [...byContinent.values()].flatMap((list) => [...list].sort((p, q) => q.rooms - p.rooms).slice(0, 6));
const world = merge(worldEntries);
const worldPath = path.join(SCRATCH, 'world.json');
fs.writeFileSync(worldPath, JSON.stringify(world));
log(`world file: ${world.continents.length} continents, ${worldEntries.length} areas`);

const areaName = (id) => arkane.continents[0].areas.find((a) => a.id === id)?.name ?? id;
const biggest = [...arkane.continents[0].areas].sort((p, q) => count(q) - count(p));
function count(a) { return a.subzones.reduce((n, s) => n + s.rooms.length, 0); }
const library = arkane.continents[0].areas.find((a) => /Great Library/.test(a.name));
const picks = [biggest[0], biggest[1], library].filter(Boolean);

await withPage(BASE, async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.setViewportSize({ width: 1600, height: 1000 });
  const input = page.getByLabel('Open a candidates file');
  const shot = (name) => page.screenshot({ path: path.join(OUT, name) });
  const toolbar = () => page.getByRole('toolbar', { name: 'Zoom level' }).getByRole('button').allTextContents();
  const polys = () => page.locator('svg polygon[data-room], svg [data-room]').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-room'))).size);
  const crumbs = async () => ((await page.locator('nav[aria-label], [aria-label*="Breadcrumb" i]').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ');

  await page.goto(BASE);
  await page.waitForLoadState('networkidle');

  // ---- the world: several continents in one file ----
  await input.setInputFiles(worldPath);
  await page.waitForSelector(`text=Opened world.json`, { timeout: 90000 });
  await page.waitForTimeout(800);
  log(`world file, toolbar: ${(await toolbar()).join(' | ')}`);
  await shot('zoom-mp_01-world-file-first-continent.png');
  const continentButtons = await page.getByRole('button', { name: /Althainia|Limbo|Icewall|Arkane|Tropica|Shokono|Oceans/ }).allTextContents();
  log(`controls that name continents: ${continentButtons.slice(0, 10).join(' | ')}`);

  // ---- Arkane: continent ----
  const t0 = Date.now();
  await input.setInputFiles(arkanePath);
  await page.waitForSelector('text=Opened arkane.json', { timeout: 90000 });
  check(`the whole Arkane continent (${arkaneRooms} rooms) opens in ${Date.now() - t0} ms`, Date.now() - t0 < 30000);
  await page.waitForTimeout(800);
  const areaButtons = await page.getByRole('list', { name: 'Areas' }).getByRole('button').count();
  check(`the continent level lists its areas (${areaButtons} of ${arkane.continents[0].areas.length}; empty ones may sit behind a fold)`, areaButtons > 0);
  log(`continent level toolbar: ${(await toolbar()).join(' | ')}`);
  await shot('zoom-mp_02-arkane-continent.png');
  await page.evaluate(() => { const svg = document.querySelector('svg'); if (svg) { svg.style.width = '100%'; svg.style.height = 'auto'; svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); } });
  await page.waitForTimeout(500);
  await shot('zoom-mp_02b-arkane-continent-fit-width.png');
  await page.reload();
  await input.setInputFiles(arkanePath);
  await page.waitForSelector('text=Opened arkane.json', { timeout: 90000 });
  await page.waitForTimeout(800);

  // ---- area, zone, room for three areas ----
  let n = 3;
  for (const area of picks) {
    const safe = area.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.getByRole('list', { name: 'Areas' }).getByRole('button', { name: new RegExp('^' + safe + ' \\d+ rooms') }).first().click();
    await page.waitForTimeout(1200);
    const tiles = await polys();
    log(`area "${area.name}" (${count(area)} rooms, ${area.subzones.length} zone(s)): ${tiles} tiles on the floor opened; toolbar: ${(await toolbar()).join(' | ')}`);
    check(`area "${area.name}" draws rooms on its opened floor`, tiles > 0);
    await shot(`zoom-mp_${String(n).padStart(2, '0')}-area-${area.id}.png`);
    n += 1;
    // zone (subzone) level
    const zone = page.getByRole('toolbar', { name: 'Zoom level' }).getByRole('button').filter({ hasText: /^Subzone|^Zone/ });
    if ((await zone.count()) && (await zone.first().isEnabled())) {
      await zone.first().click();
      await page.waitForTimeout(800);
      await shot(`zoom-mp_${String(n).padStart(2, '0')}-zone-${area.id}.png`);
      n += 1;
    }
    // room level: the zoom-in button beside a room of the list
    await page.locator('details summary').first().click().catch(() => undefined);
    const zoomIn = page.getByRole('button', { name: /^Zoom in to / });
    if (await zoomIn.count()) {
      const pick = zoomIn.nth(Math.min(5, (await zoomIn.count()) - 1));
      await pick.scrollIntoViewIfNeeded();
      await pick.click();
      await page.waitForTimeout(1000);
      const drawn = await polys();
      log(`room level of "${area.name}": ${drawn} rooms drawn (the room and the rooms its exits reach); toolbar: ${(await toolbar()).join(' | ')}`);
      check(`the room level of "${area.name}" draws the room with its neighbours (${drawn} rooms: a handful, not the whole floor)`, drawn >= 1 && drawn <= 12);
      await shot(`zoom-mp_${String(n).padStart(2, '0')}-room-${area.id}.png`);
      n += 1;
      // the zone (subzone) level: with a room chosen the Subzone step is on, one click up from the room
      const zoneStep = page.getByRole('toolbar', { name: 'Zoom level' }).getByRole('button').filter({ hasText: /^Subzone/ });
      if ((await zoneStep.count()) && (await zoneStep.first().isEnabled())) {
        await zoneStep.first().click();
        await page.waitForTimeout(800);
        log(`zone level of "${area.name}": ${await polys()} rooms on the floor shown; toolbar: ${(await toolbar()).join(' | ')}`);
        await shot(`zoom-mp_${String(n).padStart(2, '0')}-zone-${area.id}.png`);
        n += 1;
      }
    }
    // the picture's legend names the marks only when the picture has them (the new build of the Mapper)
    const legend = await page.getByRole('list', { name: 'How to read the map' }).allTextContents();
    log(`legend: ${legend.join(' | ').slice(0, 260)}`);
    if (/Great Library/.test(area.name)) check('the Mapper legend explains the diamond, the hourglass and the hexagon for the maze', /diamond:/.test(legend.join(' ')) && /hourglass:/.test(legend.join(' ')) && /hexagon:/.test(legend.join(' ')));
    // back out to the continent
    const cont = page.getByRole('toolbar', { name: 'Zoom level' }).getByRole('button').filter({ hasText: /^Continent/ });
    if (await cont.first().isEnabled()) await cont.first().click();
    await page.waitForTimeout(500);
  }
  check('no page error and no console error during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
}, { headless: true });

log(`${checks.filter(Boolean).length}/${checks.length} checks pass`);
process.exit(checks.every(Boolean) ? 0 : 1);
