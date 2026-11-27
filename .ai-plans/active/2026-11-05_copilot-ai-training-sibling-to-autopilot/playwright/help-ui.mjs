// Phase 41 UI check: the blue (i) in the Copilot window and the map window opens their help, on the dev stack's game client. Copilot is left OFF
// (the owner's own state: nothing is asked of its server), which is exactly when a new user needs the help.
//   node help-ui.mjs <out folder> [<showcase folder to copy into>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const SHOW = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
if (SHOW) fs.mkdirSync(SHOW, { recursive: true });
const APP = 'https://game-client.shatteredarchive.dev/';
const log = (t) => console.log(`[help] ${t}`);
const checks = [];
const check = (name, ok) => (checks.push([name, ok]), log(`${ok ? 'PASS' : 'FAIL'} ${name}`));

await withPage(APP, async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP);
  await page.evaluate(() => { localStorage.setItem('copilot.window.v1', JSON.stringify({ x: 560, y: 56, width: 520, height: 560 })); localStorage.setItem('shatteredarchive:worldmap:window:v1', JSON.stringify({ x: 560, y: 56, width: 520, height: 560 })); });
  await page.goto(APP);
  await page.waitForTimeout(2500);
  const menu = async (item) => {
    await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await page.getByText(item, { exact: false }).first().click();
  };

  // ---- Copilot ----
  await menu('Copilot…');
  const copilot = page.getByRole('dialog', { name: 'Copilot' });
  await copilot.waitFor({ state: 'visible' });
  const info = copilot.getByRole('button', { name: 'Help: Copilot' });
  check('the Copilot window has a blue (i)', await info.isVisible());
  const color = await info.evaluate((el) => getComputedStyle(el).backgroundColor);
  check(`the (i) is blue (${color})`, /rgb\(47, 125, 225\)/.test(color));
  check('the window says Copilot is off and points to the (i)', (await copilot.getByText(/The blue \(i\) next to the title/).count()) === 1);
  await info.click();
  const article = copilot.getByRole('article', { name: 'Copilot help' });
  await article.waitFor({ state: 'visible' });
  check('the help opens in the window, with its headings', (await article.getByRole('heading', { name: 'Getting started' }).count()) === 1 && (await article.getByRole('heading', { name: 'If nothing happens' }).count()) === 1);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-41_01-copilot-help.png') });
  if (SHOW) {
    const shot = await saveShowcase(page, 'copilot-help', '01-help-file', { description: 'The Copilot window with its help open from the blue (i): what Copilot is, how to get it working, what to do when nothing happens, how to answer a suggestion, and what it never does by itself.' });
    const file = typeof shot === 'string' ? shot : shot?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_11_copilot-help.png'));
  }
  await article.getByRole('button', { name: '← Back to Copilot' }).click();
  check('Back returns to the window', (await copilot.getByText(/Copilot is off/).isVisible()));
  await copilot.getByRole('button', { name: 'Close Copilot' }).click();

  // ---- the map ----
  await menu('Map…');
  const map = page.getByRole('dialog', { name: 'Map' });
  await map.waitFor({ state: 'visible' });
  const mapInfo = map.getByRole('button', { name: 'Help: the map' });
  check('the map window has a blue (i)', await mapInfo.isVisible());
  await mapInfo.click();
  const mapHelp = map.getByRole('article', { name: 'Map help' });
  await mapHelp.waitFor({ state: 'visible' });
  check('the map help covers fog of war and your own rooms', (await mapHelp.getByText(/Fog of war/).count()) > 0 && (await mapHelp.getByRole('heading', { name: 'Your own rooms' }).count()) === 1);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-41_02-map-help.png') });
  if (SHOW) {
    const shot = await saveShowcase(page, 'map-help', '01-help-file', { description: 'The map window with its help open from the blue (i): where you are, moving around, the settings, fog of war and your own rooms.' });
    const file = typeof shot === 'string' ? shot : shot?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_12_map-help.png'));
  }
  await page.keyboard.press('Escape');
  check('Escape closes the help first', (await mapHelp.count()) === 0 && (await map.isVisible()));
});

const failed = checks.filter(([, ok]) => !ok);
log(`${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length === 0 ? 0 : 1);
