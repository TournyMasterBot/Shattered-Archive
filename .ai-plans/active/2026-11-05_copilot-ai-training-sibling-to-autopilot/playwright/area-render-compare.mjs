// Renders one area (on its busiest floor) from map files with the real shared renderer and photographs each, so the tangled-link look can be compared
// before and after (same area, two files). Prints the tangled-exit count of the drawn floor.
//   node area-render-compare.mjs <out folder> <area id> <label=map.json> [<label=map.json> ...]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import * as core from 'file:///C:/Projects/ShatteredArchive/services/shattered-maps-core/dist/index.js';
import fs from 'node:fs';
import path from 'node:path';

const [OUT, AREA, ...pairs] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const log = (t) => console.log(`[area-compare] ${t}`);

await withPage('http://localhost:5000/maps/world-v2', async (page) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  for (const pair of pairs) {
    const [label, file] = pair.split('=');
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    const slice = core.sliceMap(map, 'area', AREA);
    const counts = new Map();
    for (const r of slice.rooms) counts.set(r.coords?.z ?? 0, (counts.get(r.coords?.z ?? 0) ?? 0) + 1);
    const [z] = [...counts.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0];
    const svg = core.renderSvg(slice, { layout: 'grid', z });
    const tangles = /data-tangles="(\d+)"/.exec(svg)?.[1] ?? '0';
    const kinds = [...new Set([...svg.matchAll(/data-kind="([a-z]+)"/g)].map((m) => m[1]))];
    const lines = (svg.match(/<line data-link=/g) ?? []).length;
    log(`${label}: ${slice.title}, floor ${z} (${counts.get(z)} rooms): ${lines} full link lines, ${tangles} tangled stubs, tile kinds ${kinds.join(',') || 'none'}`);
    await page.setContent(`<!doctype html><body style="margin:0;background:#f4f5f7"><div style="width:1480px">${svg.replace(/width="[^"]*" height="[^"]*"/, 'width="1480"')}</div></body>`);
    await page.screenshot({ path: path.join(OUT, `area-${AREA}-${label}.png`), fullPage: false, clip: { x: 0, y: 0, width: 1500, height: 1000 } });
  }
}, { headless: true });
