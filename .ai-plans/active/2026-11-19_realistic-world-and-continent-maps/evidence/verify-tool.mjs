// Drives the generated placement pages in a real browser: renders, moves a token, drags one in from the list, selects one, reads the saved document back.
//   node verify-tool.mjs <training folder> <screenshot folder>
import fs from 'node:fs';
import path from 'node:path';
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
const [DIR, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const log = (t) => console.log(`[verify] ${t}`);
const must = (c, m) => { if (!c) throw new Error(`FAILED: ${m}`); log(`ok: ${m}`); };

await withPage('http://localhost:5000/maps/world-v2', async (page) => {
  await page.setViewportSize({ width: 1750, height: 1100 });
  for (const [file, move, pick, dragIn] of [['placement-world.html', 'Arkane', 'Arsataw Yaa', 'Limbo'], ['placement-arkane.html', 'Arkane', 'Kender Forest', 'Marauders Merchant District 1']]) {
    await page.setContent(fs.readFileSync(path.join(DIR, file), 'utf8'));
    await page.evaluate(() => localStorage.clear());
    await page.reload().catch(() => {});
    await page.setContent(fs.readFileSync(path.join(DIR, file), 'utf8'));
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => window.__placement.doc());
    log(`${file}: ${before.placements.length} placed, ${before.unplaced.length} in the list, units ${before.frame.units}`);
    must(before.placements.length > 0 && before.unplaced.length > 0, 'some places start on the map and some in the list');
    await page.screenshot({ path: path.join(OUT, `tool-${file.replace('.html', '')}-start.png`) });

    // move a placed token
    const tok = page.locator('.token').filter({ has: page.locator('text', { hasText: new RegExp('^' + move + '$') }) }).first();
    const box = await tok.boundingBox();
    const x0 = before.placements.find((p) => p.name === move).at;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__placement.doc());
    const x1 = after.placements.find((p) => p.name === move).at;
    must(x1[0] !== x0[0] && x1[1] !== x0[1], `dragging ${move} moved it from ${x0} to ${x1}`);
    must(after.placements.find((p) => p.name === move).confirmed === true, `${move} is confirmed once moved`);

    // drag an area in from the list
    const item = page.locator('.item', { hasText: dragIn }).first();
    const ib = await item.boundingBox();
    await page.mouse.move(ib.x + 20, ib.y + 8);
    await page.mouse.down();
    await page.mouse.move(1250, 980, { steps: 8 });
    await page.mouse.up();
    const dropped = await page.evaluate(() => window.__placement.doc());
    must(dropped.placements.some((p) => p.name === dragIn) && !dropped.unplaced.includes(dropped.placements.find((p) => p.name === dragIn).areaId), `${dragIn} dragged in from the list is placed`);

    // select: the exits show
    await page.locator('.token').filter({ has: page.locator('text', { hasText: new RegExp('^' + pick + '$') }) }).first().click();
    const info = await page.locator('#info').innerText();
    must(/Exits from here into:/.test(info) && info.length > 40, `selecting ${pick} lists its exits`);
    await page.screenshot({ path: path.join(OUT, `tool-${file.replace('.html', '')}-after.png`) });
    // autosave survives a reload of the same page
    const saved = await page.evaluate((k) => localStorage.getItem(k) !== null, 'placement:' + dropped.scope.id);
    must(saved, 'the placement is autosaved in the browser');
  }
}, { headless: true });
log('all checks passed');
