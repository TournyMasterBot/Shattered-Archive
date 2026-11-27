// Phase 27 showcase: the finished new map page on a scratch C# site (see maps-v2-scratch-run.mjs), through the Shattered-AI showcase helper.
//   node maps-v2-showcase.mjs <showcase folder to copy into> <base url>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const BASE = process.argv[3] ?? 'http://127.0.0.1:5097';
fs.mkdirSync(OUT, { recursive: true });
const FEATURE = 'world-map-csharp';
const waitStatus = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('wm2-status')?.textContent ?? ''), re.source, { timeout: 20000 });

await withPage(`${BASE}/maps/world-v2`, async (page) => {
  await page.setViewportSize({ width: 1440, height: 1250 });
  await page.goto(`${BASE}/maps/world-v2`);
  await waitStatus(page, /areas on/);
  // the largest area with a floor that shows an off-page arrow, a room selected for its details
  await page.locator('#wm2-area').selectOption('az-a68');
  await waitStatus(page, /rooms/);
  await page.locator('#wm2-floor').selectOption('1');
  const mark = page.locator('#wm2-surface svg text:text-is("→")').first();
  await mark.scrollIntoViewIfNeeded();
  await page.locator('#wm2-surface svg [data-room]').nth(5).click();
  await page.waitForTimeout(400);
  const file = await saveShowcase(page, FEATURE, '01-area-with-details', { description: 'The new world map page: an area drawn by the shared renderer with an off-page exit marked, the room details beside it, the legend below and the credit line for the community map data' });
  const shotPath = typeof file === 'string' ? file : file?.path;
  if (shotPath && fs.existsSync(shotPath)) fs.copyFileSync(shotPath, path.join(OUT, 'showcase_03_csharp-map.png'));
  console.log('showcase saved', shotPath ?? '(see the helper output folder)');
});
