// Phase 24a: the Copilot on/off switch, driven like a person against the dev stack's game client. NOT connected to any game server.
//   node copilot-switch.mjs <out folder for screenshots>
// Checks: a fresh browser starts with Copilot off (menu says "(off)", the window says so, no request reaches the Copilot server), turning it
// on starts the requests and is remembered across a reload, turning it off stops them again, the switch works from the keyboard and shows a
// focus ring, the header still fits at the minimum width with it on, and the native colours of the switch follow the dark palette.
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// what the Copilot server says about its own learning (a read of GET /control from the game page, which the server allows)
const serverLearning = (page) => page.evaluate(async () => (await (await fetch('https://copilot.shatteredarchive.dev/control')).json()).enabled);

const gameMenu = (page) => page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first();

await withPage(
  'https://game-client.shatteredarchive.dev/',
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = [];
    const toServer = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => {
      if (r.url().includes('copilot.shatteredarchive.dev')) toServer.push(new URL(r.url()).pathname);
    });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.removeItem('copilot.enabled.v1'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 1. fresh browser: off
    await gameMenu(page).click();
    const item = page.getByText('Copilot…', { exact: false }).first();
    check('the Game menu entry says (off) in a browser that was never asked', ((await item.textContent()) ?? '').includes('(off)'), (await item.textContent()) ?? '');
    await shot(page, 'phase-24a_menu-off.png');
    await page.getByText('Copilot…', { exact: false }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Copilot' });
    await dialog.waitFor({ state: 'visible' });
    const sw = dialog.getByRole('switch', { name: 'Copilot' });
    check('the window opens with the switch off', (await sw.getAttribute('aria-checked')) === 'false' && ((await sw.textContent()) ?? '').includes('Off'));
    check('and says Copilot is off, with no mode, status or tabs', (await dialog.getByText('Copilot is off.').count()) === 1 && (await dialog.getByLabel('Mode').count()) === 0 && (await dialog.getByRole('status').count()) === 0 && (await dialog.getByRole('button', { name: 'Suggestions' }).count()) === 0);
    await sleep(4500);
    check('no request reaches the Copilot server while it is off (4.5 s watched)', toServer.length === 0, JSON.stringify(toServer));
    await shot(page, 'phase-24a_off.png');
    check('24b: the server starts with learning off and the page left it so', (await serverLearning(page)) === false);

    // 2. switch on
    await sw.click();
    await page.waitForFunction(async () => (await (await fetch('https://copilot.shatteredarchive.dev/control')).json()).enabled === true, null, { timeout: 10000 });
    check('24b: switching on made the server start learning (GET /control says true)', (await serverLearning(page)) === true);
    await page.waitForFunction(() => /Online|Offline/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
    const state = await page.evaluate(async () => (await (await fetch('https://copilot.shatteredarchive.dev/state')).json()).learning);
    check('24b: and /state carries learning: true', state === true);
    check('switching on shows the working window', (await sw.getAttribute('aria-checked')) === 'true' && (await dialog.getByLabel('Mode').count()) === 1);
    await page.waitForFunction(() => /Online|Offline/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
    check('and the requests to the Copilot server start (/state at least)', toServer.includes('/state'), JSON.stringify([...new Set(toServer)]));
    await shot(page, 'phase-24a_on.png');
    const stored = await page.evaluate(() => localStorage.getItem('copilot.enabled.v1'));
    check('the choice is stored as true', stored === 'true', String(stored));

    // 3. remembered across a reload, menu no longer says (off)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await gameMenu(page).click();
    const item2 = page.getByText('Copilot…', { exact: false }).first();
    check('after a reload the menu entry has no (off)', !((await item2.textContent()) ?? '').includes('(off)'), (await item2.textContent()) ?? '');
    await item2.click();
    const sw2 = page.getByRole('dialog', { name: 'Copilot' }).getByRole('switch', { name: 'Copilot' });
    await sw2.waitFor({ state: 'visible' });
    check('and the window opens with the switch on', (await sw2.getAttribute('aria-checked')) === 'true');

    // 4. switch off stops the requests
    await page.waitForFunction(() => /Online|Offline/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
    await sw2.click();
    await sleep(800);
    check('24b: switching off made the server stop learning (GET /control says false)', (await serverLearning(page)) === false);
    const after = toServer.length;
    await sleep(7000);
    check('switching off stops the requests (7 s watched, polls come every 3 s)', toServer.length === after, `${after} then ${toServer.length}`);
    check('and the window says Copilot is off again', (await page.getByText('Copilot is off.').count()) === 1);
    await page.keyboard.press('Escape'); // closes the window if it has focus; the menu entry shows the state
    await gameMenu(page).click();
    check('the menu entry says (off) again', (((await page.getByText('Copilot…', { exact: false }).first().textContent()) ?? '').includes('(off)')));
    // the menu is open: choose the entry to bring the window back (it was closed by Escape)
    await page.getByText('Copilot…', { exact: false }).first().click();

    // 5. keyboard and focus ring
    const dlg = page.getByRole('dialog', { name: 'Copilot' });
    const sw3 = dlg.getByRole('switch', { name: 'Copilot' });
    await sw3.focus();
    await page.keyboard.press('Space');
    check('Space on the focused switch turns Copilot on', (await sw3.getAttribute('aria-checked')) === 'true');
    await page.keyboard.press('Enter');
    check('Enter turns it off again', (await sw3.getAttribute('aria-checked')) === 'false');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const ring = await sw3.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, scheme: s.colorScheme };
    });
    check('the switch shows a focus ring when reached by keyboard', ring.style === 'solid' && parseFloat(ring.width) >= 2, JSON.stringify(ring));

    // 6. narrowest window, switch on: nothing clipped
    await sw3.click();
    await page.waitForFunction(() => /Online|Offline|Checking/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
    const box = await dlg.boundingBox();
    // resize to the 360 minimum by dragging the corner
    await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 8 });
    await page.mouse.up();
    const narrow = await dlg.boundingBox();
    const closeBox = await dlg.getByRole('button', { name: 'Close Copilot' }).boundingBox();
    check(`at the minimum width (${Math.round(narrow.width)} px) with the switch on, the close button is inside the window`, narrow.width <= 362 && closeBox.x + closeBox.width <= narrow.x + narrow.width + 0.5, `${Math.round(narrow.width)} / close ends at ${Math.round(closeBox.x + closeBox.width - narrow.x)}`);
    await shot(page, 'phase-24a_on-narrow.png');
    await sw3.click(); // off
    await shot(page, 'phase-24a_off-narrow.png');
    check('H2: the switch uses the dark palette (dark background, light text)', await sw3.evaluate((el) => {
      const s = getComputedStyle(el);
      const lum = (c) => { const m = c.match(/\d+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      return lum(s.backgroundColor) < 0.15;
    }));

    await page.evaluate(() => localStorage.removeItem('copilot.enabled.v1')); // leave the owner's browser as found: off
    check('no page error during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
  },
  { headless: true },
);

const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
