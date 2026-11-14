// Renders the continent picture of Arkane from map files (before and after the layout, both size modes) with the real shared renderer and
// photographs each at the same width, so the layouts can be compared. Numbers: overlapping pairs, picture size, the smallest box's size.
//   node continent-layout-compare.mjs <out folder> <label=map.json> [<label=map.json> ...]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import * as core from 'file:///C:/Projects/ShatteredArchive/services/shattered-maps-core/dist/index.js';
import fs from 'node:fs';
import path from 'node:path';

const [OUT, ...pairs] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const CONTINENT = 'az-c411';
const log = (t) => console.log(`[layout-compare] ${t}`);

await withPage('http://localhost:5000/maps/world-v2', async (page) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  for (const pair of pairs) {
    const [label, file] = pair.split('=');
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    const continent = map.continents.find((c) => c.id === CONTINENT);
    const boxes = continent.areas.map((a) => a.placement);
    const overlaps = core.countOverlaps(boxes);
    const smallest = boxes.reduce((m, b) => (b.w * b.h < m.w * m.h ? b : m), boxes[0]);
    const extent = { w: Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x)), h: Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)) };
    const slice = core.sliceMap(map, 'continent', CONTINENT);
    const svg = core.renderSvg(slice, { layout: 'grid' });
    log(`${label}: ${boxes.length} boxes, ${overlaps} overlapping pairs, extent ${extent.w} x ${extent.h} cells, smallest box ${smallest.w} x ${smallest.h}`);
    await page.setContent(`<!doctype html><body style="margin:0;background:#f4f5f7"><div style="width:1480px">${svg.replace(/width="[^"]*" height="[^"]*"/, 'width="1480"')}</div></body>`);
    await page.screenshot({ path: path.join(OUT, `layout-${label}.png`), fullPage: true });
  }
}, { headless: true });
