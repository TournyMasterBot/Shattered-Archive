// Showcase shots of the finished world-map page (Phases 30, 48-49): the Great Library with a maze room selected and its exits traced, a continent,
// and an area with terrain and stairs.
//   node maps-showcase.mjs <showcase folder to copy into>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [SHOW] = process.argv.slice(2);
if (!SHOW) throw new Error('give the showcase folder');
fs.mkdirSync(SHOW, { recursive: true });
const BASE = 'http://localhost:5000';
const copy = (saved, name) => {
  const file = typeof saved === 'string' ? saved : saved?.path;
  if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, name));
};

await withPage(`${BASE}/maps/world-v2`, async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const open = async (c, a) => {
    await page.goto(`${BASE}/maps/world-v2#c=${c}&a=${a}`);
    await page.reload();
    await page.waitForFunction(() => /rooms|areas on/.test(document.getElementById('wm2-status')?.textContent ?? ''), null, { timeout: 40000 });
    await page.waitForTimeout(600);
  };

  await open('az-c411', 'az-a229');
  const maze = page.locator('#wm2-surface svg polygon[data-kind="maze"]').nth(5);
  await maze.scrollIntoViewIfNeeded();
  await maze.click({ force: true });
  await page.waitForTimeout(600);
  // zoom out so the whole of the trace (the room and every room its exits land in) is in the picture
  await page.locator('#wm2-surface').focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('-');
  await page.locator('#wm2-surface svg [data-selected-ring]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.mouse.move(5, 5);
  copy(await saveShowcase(page, 'map-maze-trace', '01-trace', { description: 'The Great Library on the website map: small chips on the edge of each maze room mark its tangled exits; the selected room is ringed and a line is drawn from each of its exits to where it lands. The plain lines are the real path.' }), 'showcase_20_map-maze-trace.png');

  await open('az-c411', '');
  await page.mouse.move(5, 5);
  copy(await saveShowcase(page, 'map-continent', '01-continent', { description: 'A continent on the website map: every area is a box sized by its rooms, none on top of another, placed beside the areas its exits join it to.' }), 'showcase_21_map-continent.png');
}, { headless: true });
console.log('showcase shots saved');
