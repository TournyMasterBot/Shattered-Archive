// The map window's world picker (local build with two worlds), driven in the browser against the dev stack: connected to the Simulacrum the window shows that
// map by itself ("Automatic"); the gear's Map choice picks the DSL map by hand (to look at a map rebuilt from the DSL), and Automatic goes back.
//   node world-map-picker.mjs <out folder> [<showcase folder to copy into>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [OUT, SHOW] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
if (SHOW) fs.mkdirSync(SHOW, { recursive: true });
const APP = 'https://game-client.shatteredarchive.dev/';
const SITE = 'http://localhost:5000';
const log = (t) => console.log(`[picker] ${t}`);
const checks = [];
const check = (name, ok, detail = '') => (checks.push(ok), log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`));

await withPage(APP, async (page) => {
  const requested = [];
  page.on('request', (r) => { if (r.url().startsWith(`${SITE}/api/world-map`)) requested.push(new URL(r.url()).pathname); });
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/world-map') && url.pathname !== '/api/health') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const dispatch = (name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('shatteredarchive:worldmap:window:v1', JSON.stringify({ x: 560, y: 56, width: 560, height: 640 })));
  await page.goto(APP);
  await page.waitForTimeout(2500);
  // connected to the Simulacrum: the window chooses its map by itself
  await dispatch('game:remote-server:open', { type: 'socket-opened', host: 'simulacrum-server.shatteredarchive.dev', port: 65001, receivedTimestamp: 'x' });
  await dispatch('game:room-data', { room: 'The Temple Of Mota', sector: 'inside', exits: ['S'] });
  await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await page.getByText('Map…', { exact: false }).first().click();
  const win = page.getByRole('dialog', { name: 'Map' });
  await win.waitFor({ state: 'visible' });
  await win.getByText('Map · Simulacrum').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => /You are|probably|One of|not on the map/.test(document.querySelector('[role="dialog"][aria-label="Map"] [role="status"]')?.textContent ?? ''), null, { timeout: 30000 });
  check('connected to the Simulacrum the window shows the Simulacrum map by itself', requested.some((p) => p.startsWith('/api/world-map/sandbox')));

  await win.getByRole('button', { name: 'Map settings' }).click();
  const select = win.getByRole('combobox', { name: 'Which map to show' });
  check('the gear has a small Map choice, on Automatic (Simulacrum)', (await select.inputValue()) === 'auto' && (await select.locator('option').allTextContents()).join('|') === 'Automatic (Simulacrum)|DSL|Simulacrum');
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-47_10-world-picker-automatic.png') });

  const before = requested.length;
  await select.selectOption('dsl');
  await win.getByRole('button', { name: 'Map settings' }).waitFor();
  await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="Map"] [class*="title"]')?.textContent === 'Map', null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  const after = requested.slice(before);
  check('picking DSL by hand switches the window to the DSL map: the title loses the world name and the DSL routes are asked', (await win.getByText('Map · Simulacrum').count()) === 0 && after.some((p) => p.startsWith('/api/world-map/') && !p.startsWith('/api/world-map/sandbox')), after.slice(0, 3).join(' '));
  await win.getByRole('button', { name: 'Map settings' }).click();
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, 'phase-47_11-world-picker-dsl-picked.png') });
  if (SHOW) {
    const saved = await saveShowcase(page, 'map-world-picker', '01-picker', { description: 'The map window\u2019s gear in a local build with two worlds: the small Map choice (Automatic follows the connection; here the DSL map is picked by hand while connected to the Simulacrum, to debug a map rebuilt from the DSL).' });
    const file = typeof saved === 'string' ? saved : saved?.path;
    if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_18_map-world-picker.png'));
  }

  await win.getByRole('combobox', { name: 'Which map to show' }).selectOption('auto');
  await win.getByText('Map · Simulacrum').waitFor({ timeout: 15000 });
  check('Automatic goes back to the connection\u2019s map', true);
}, { headless: true });

log(`${checks.filter(Boolean).length}/${checks.length} checks pass`);
process.exit(checks.every(Boolean) ? 0 : 1);
