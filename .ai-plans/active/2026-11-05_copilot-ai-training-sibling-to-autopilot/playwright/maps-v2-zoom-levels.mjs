// The C# world-map page (/maps/world-v2) exercised at every level it has, on the REAL audited DSL map served by the local site:
// the continent list (the "world"), a continent (areas as boxes by their written placement; Arkane first), zoom in / out / fit, areas (rooms and floors),
// a room's details. Also prints geometry facts about the continent picture so odd spacing is a number, not only a feeling.
//   NODE_USE_SYSTEM_CA=1 node maps-v2-zoom-levels.mjs <out folder> [<base url>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:5000';
fs.mkdirSync(OUT, { recursive: true });
const log = (t) => console.log(`[zoom-cs] ${t}`);
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`));

const index = await (await fetch(`${BASE}/api/world-map/index`)).json();
const ARKANE = index.continents.find((c) => /arkan/i.test(c.name));
log(`continents: ${index.continents.map((c) => `${c.name} (${c.areas} areas, ${c.rooms} rooms)`).join('; ')}`);
const arkaneAreas = index.areas.filter((a) => a.continentId === ARKANE.id);
const bySize = [...arkaneAreas].sort((p, q) => q.rooms - p.rooms);
async function busiestFloor(areaId) {
  const counts = new Map();
  for (let off = 0; off !== null; ) {
    const j = await (await fetch(`${BASE}/api/world-map/area/${areaId}?limit=300&offset=${off}`)).json();
    for (const sz of j.area.subzones) for (const r of sz.rooms) counts.set(r.coords?.z ?? 0, (counts.get(r.coords?.z ?? 0) ?? 0) + 1);
    off = j.nextOffset ?? null;
  }
  const [z, n] = [...counts.entries()].sort((p, q) => q[1] - p[1] || Math.abs(p[0]) - Math.abs(q[0]))[0];
  return { z, n };
}
const small = [...arkaneAreas].sort((p, q) => p.rooms - q.rooms).find((a) => a.rooms >= 3);

// ---- geometry facts about the written placements of Arkane's areas: overlaps and gaps ----
const placed = arkaneAreas.filter((a) => a.placement);
const overlaps = [];
for (let i = 0; i < placed.length; i += 1)
  for (let j = i + 1; j < placed.length; j += 1) {
    const a = placed[i].placement, b = placed[j].placement;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w > 0 && h > 0) overlaps.push(`${placed[i].name} x ${placed[j].name} (${w}x${h})`);
  }
const xs = placed.map((a) => a.placement.x), ys = placed.map((a) => a.placement.y);
const span = { x: [Math.min(...xs), Math.max(...placed.map((a) => a.placement.x + a.placement.w))], y: [Math.min(...ys), Math.max(...placed.map((a) => a.placement.y + a.placement.h))] };
log(`${ARKANE.name}: ${placed.length} of ${arkaneAreas.length} areas have a placement; extent x ${span.x.join('..')}, y ${span.y.join('..')}; ${overlaps.length} overlapping pairs${overlaps.length ? `: ${overlaps.slice(0, 8).join('; ')}` : ''}`);

await withPage(`${BASE}/maps/world-v2`, async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  const status = () => page.locator('#wm2-status').innerText();
  const waitStatus = (re, timeout = 30000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('wm2-status')?.textContent ?? ''), re.source, { timeout });
  const shot = (name) => page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const surfaceBox = () => page.locator('#wm2-surface svg').first().boundingBox();
  const tiles = () => page.locator('#wm2-surface svg [data-room]').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-room'))).size);

  // ---- the world: the continents, one after the other ----
  await page.goto(`${BASE}/maps/world-v2`);
  await waitStatus(/areas on/);
  const options = await page.locator('#wm2-continent option').allTextContents();
  check(`the continent list (the world level) offers all ${index.continents.length} continents`, options.length === index.continents.length, options.join(' | '));
  await shot('zoom-cs_01-world-first-continent.png');
  let n = 2;
  for (const c of index.continents.filter((c) => c.id !== ARKANE.id && c.id !== 'az-unsorted')) {
    await page.goto(`${BASE}/maps/world-v2#c=${encodeURIComponent(c.id)}`);
    await page.reload();
    await waitStatus(new RegExp(`${c.areas} areas on`));
    await shot(`zoom-cs_${String(n).padStart(2, '0')}-continent-${c.name.toLowerCase().replace(/[^a-z]+/g, '-')}.png`);
    n += 1;
  }

  // ---- the continent Arkane: the picture, then zoom ----
  await page.goto(`${BASE}/maps/world-v2#c=${encodeURIComponent(ARKANE.id)}`);
  await page.reload();
  await waitStatus(new RegExp(`${arkaneAreas.length} areas on`));
  const base = await surfaceBox();
  await shot('zoom-cs_10-arkane-continent-100.png');
  const boxes = await page.locator('#wm2-surface svg [data-area]').count();
  check(`the Arkane picture draws ${boxes} area boxes for ${arkaneAreas.length} areas`, boxes > 0 && boxes <= arkaneAreas.length, `${placed.length} have a placement`);
  for (let i = 0; i < 3; i += 1) await page.locator('#wm2-zoom-out').click();
  const out = await surfaceBox();
  check('Zoom out makes the picture smaller', out.width < base.width, `${Math.round(base.width)} -> ${Math.round(out.width)} px`);
  await shot('zoom-cs_11-arkane-continent-zoomed-out.png');
  await page.locator('#wm2-zoom-fit').click();
  await shot('zoom-cs_12-arkane-continent-fit.png');
  for (let i = 0; i < 5; i += 1) await page.locator('#wm2-zoom-in').click();
  const inn = await surfaceBox();
  check('Zoom in makes it bigger again', inn.width > out.width, `${Math.round(out.width)} -> ${Math.round(inn.width)} px`);
  await shot('zoom-cs_13-arkane-continent-zoomed-in.png');

  // ---- areas: the biggest, a small one ----
  let m = 20;
  for (const area of [...bySize.slice(0, 3), small].filter(Boolean)) {
    await page.goto(`${BASE}/maps/world-v2#c=${encodeURIComponent(ARKANE.id)}&a=${encodeURIComponent(area.id)}`);
    await page.reload();
    await waitStatus(/rooms|floor|nothing to draw/i);
    await page.waitForTimeout(600);
    const drawn = await tiles();
    log(`area ${area.name} (${area.rooms} rooms in the map): ${drawn} room tiles on the shown floor; status "${(await status()).slice(0, 90)}"`);
    check(`the area "${area.name}" draws rooms`, drawn > 0);
    const expected = await busiestFloor(area.id);
    const shown = await page.locator('#wm2-floor').inputValue();
    check(`the area "${area.name}" opens on its busiest floor (${expected.z} with ${expected.n} of ${area.rooms} rooms), not on an empty-looking one`, String(expected.z) === shown, `floor shown: ${shown}`);
    await shot(`zoom-cs_${m}-area-${area.id}.png`);
    m += 1;
  }

  // ---- a room: click one, read its details ----
  await page.goto(`${BASE}/maps/world-v2#c=${encodeURIComponent(ARKANE.id)}&a=${encodeURIComponent(bySize[1].id)}`);
  await page.reload();
  await waitStatus(/rooms|floor/i);
  await page.waitForTimeout(600);
  await page.locator('#wm2-surface svg [data-room]').first().click({ force: true });
  await page.waitForTimeout(500);
  const roomText = await page.locator('#wm2-room').innerText();
  check('clicking a room shows its details (a title and exits)', /exit/i.test(roomText) && roomText.length > 20, roomText.replace(/\s+/g, ' ').slice(0, 80));
  await shot('zoom-cs_30-room-details.png');
  check('no page error and no console error during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
}, { headless: true });

log(`${checks.filter(Boolean).length}/${checks.length} checks pass`);
process.exit(checks.every(Boolean) ? 0 : 1);
