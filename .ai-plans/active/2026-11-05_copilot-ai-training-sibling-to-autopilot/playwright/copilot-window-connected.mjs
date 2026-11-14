// Phase 12, the connected half: sign in to SIMULACRUM like a person, get the access code, connect the game client to the simulacrum
// relay (never the real DSL host), open the Copilot window, and show that the command input behind it still takes clicks and typing.
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const cred = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const SIM_HOST = 'simulacrum-server.shatteredarchive.dev'; // the only relay this script ever dials
const SIM_PORT = '65001';

await withPage(
  'https://simulacrum.shatteredarchive.dev/',
  async (page) => {
    const context = page.context();

    // 1. sign in to simulacrum
    await page.getByRole('link', { name: /sign in/i }).click();
    await page.locator('input').first().fill(cred.username);
    await page.locator('input[type="password"]').fill(cred.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.getByRole('button', { name: /^Continue as/ }).click(); // the consent screen of the auth hub
    await page.waitForURL(/simulacrum\.shatteredarchive\.dev/, { timeout: 15000 });
    await page.getByRole('button', { name: 'Get access code' }).click();
    const code = (await page.locator('.code').textContent({ timeout: 10000 }))?.trim() ?? '';
    check('simulacrum issued an access code to the trusted test account', code.length >= 16);

    // 2. the game client, connected to the simulacrum relay
    const game = await context.newPage();
    await game.setViewportSize({ width: 1440, height: 900 });
    await game.goto('https://game-client.shatteredarchive.dev/');
    await game.waitForLoadState('networkidle');
    await game.locator('[class*="menuItem"]').filter({ hasText: /^File/ }).first().click();
    await game.getByText('Connect…', { exact: true }).click();
    const modal = game.getByRole('dialog', { name: 'Connect to server' });
    await modal.getByLabel('Host').fill(SIM_HOST);
    await modal.getByLabel('Port').fill(SIM_PORT);
    await modal.getByRole('button', { name: /^Connect/ }).click();
    const input = game.locator('#game-command-input');
    await game.waitForFunction(() => !document.querySelector('#game-command-input')?.disabled, null, { timeout: 20000 });
    check('connected to the simulacrum relay (the command input is enabled)', await input.isEnabled());
    if (await modal.isVisible().catch(() => false)) await modal.getByRole('button', { name: 'Close' }).click();

    // the relay asks for the code first; typing it is a real use of the input
    await input.click();
    await input.fill(code);
    await input.press('Enter');
    await game.waitForTimeout(2500);
    await game.screenshot({ path: path.join(OUT, 'phase-12_connected-simulacrum.png') });

    // 3. open the Copilot window and type in the page behind it
    await game.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await game.getByText('Copilot…', { exact: true }).click();
    const dialog = game.getByRole('dialog', { name: 'Copilot' });
    await dialog.waitFor({ state: 'visible' });
    check('the Copilot window opens while connected', await dialog.isVisible());
    check('opening the window did not take focus from the page', !(await dialog.evaluate((el) => el.contains(document.activeElement))));

    // click the page behind the window (the terminal area), then type
    await game.mouse.click(300, 300);
    await game.waitForTimeout(200);
    await input.click();
    await input.type('look', { delay: 40 });
    check('typing reaches the command input while the window is open', (await input.inputValue()) === 'look', await input.inputValue());
    check('the input holds focus while the window is open', await input.evaluate((el) => document.activeElement === el));
    await game.screenshot({ path: path.join(OUT, 'phase-12_input-behind.png') });

    // the gate learns of the typing: Copilot must stay quiet right now (2 s window), observed through the page's own event bus
    const sentWhileTyping = await game.evaluate(async () => {
      let heard = 0;
      const on = () => (heard += 1);
      window.addEventListener('shatteredarchive:send-command', on);
      window.dispatchEvent(new CustomEvent('shatteredarchive:user-typing', { detail: { at: Date.now() } }));
      await new Promise((r) => setTimeout(r, 50));
      window.removeEventListener('shatteredarchive:send-command', on);
      return heard;
    });
    check('no command was sent by anything while the user was typing', sentWhileTyping === 0);

    await input.press('Enter');
    await game.waitForTimeout(1500);
    await game.screenshot({ path: path.join(OUT, 'phase-12_after-enter.png') });

    // with the window open and connected, the status is read from the live server
    const status = (await dialog.getByRole('status').textContent())?.trim();
    check('the window shows a status while connected', !!status, status);

    // drag it while connected, then keep typing
    const title = dialog.getByText('Copilot', { exact: true }).first();
    const tb = await title.boundingBox();
    await game.mouse.move(tb.x + 5, tb.y + 5);
    await game.mouse.down();
    await game.mouse.move(tb.x - 700, tb.y + 20, { steps: 8 }); // up in the corner, clear of the command row
    await game.mouse.up();
    await input.click();
    await input.fill('');
    await input.type('n', { delay: 30 });
    check('after dragging the window the input still takes typing', (await input.inputValue()) === 'n');
    await game.screenshot({ path: path.join(OUT, 'phase-12_dragged-connected.png') });
    await input.fill('');
  },
  { contextOptions: { viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true } },
);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
