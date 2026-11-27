// One picture of a whole continent from a map file with the real renderer, the areas of a layout spec highlighted, so the owner's geography can be read
// at a glance (the pinned areas in blue, the centre in yellow, the rest grey).
//   node continent-overview.mjs <out png> <map.json> <layout spec.json>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import * as core from 'file:///C:/Projects/ShatteredArchive/services/shattered-maps-core/dist/index.js';
import fs from 'node:fs';

const [OUT, MAP, SPEC] = process.argv.slice(2);
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const svg = core.renderSvg(core.sliceMap(map, 'continent', spec.continent), { layout: 'grid' });
const pinned = spec.relations.map((r) => r.area);
const css = `rect[data-area]{fill:#e3e6ea}${pinned.map((id) => `rect[data-area="${id}"]{fill:#9ec5f5;stroke:#1d4ed8;stroke-width:2}`).join('')}rect[data-area="${spec.center}"]{fill:#ffe38a;stroke:#b9770e;stroke-width:3}`;
await withPage('http://localhost:5000/maps/world-v2', async (page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.setContent(`<!doctype html><style>${css}</style><body style="margin:0;background:#f4f5f7"><div style="width:1580px">${svg.replace(/width="[^"]*" height="[^"]*"/, 'width="1580"')}</div></body>`);
  await page.screenshot({ path: OUT, fullPage: true });
}, { headless: true });
console.log(`wrote ${OUT}`);
