// Phase 29e (exploration): sign in to the SIMULACRUM like a person, connect the game client to the simulacrum relay (never the DSL host), type the access
// code, and print what the game asks next (the last lines of the terminal; no credentials are printed).
//   node simulacrum-explore.mjs <test-account.local.json> <out folder>
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const cred = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const SIM_HOST = 'simulacrum-server.shatteredarchive.dev'; // the only relay this script ever dials
const SIM_PORT = '65001';

const terminalText = (page) =>
  page.evaluate(() => {
    // xterm draws one div per row inside .xterm-rows
    const rows = document.querySelector('.xterm-rows');
    return (rows?.innerText ?? '(no terminal rows found)').replace(/\n{3,}/g, '\n\n').slice(-1800);
  });

await withPage('https://simulacrum.shatteredarchive.dev/', async (page) => {
  const context = page.context();
  await page.getByRole('link', { name: /sign in/i }).click();
  await page.locator('input').first().fill(cred.username);
  await page.locator('input[type="password"]').fill(cred.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: /^Continue as/ }).click();
  await page.waitForURL(/simulacrum\.shatteredarchive\.dev/, { timeout: 15000 });
  await page.getByRole('button', { name: 'Get access code' }).click();
  const code = (await page.locator('.code').textContent({ timeout: 10000 }))?.trim() ?? '';
  console.log('access code issued:', code.length >= 16);

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
  if (await modal.isVisible().catch(() => false)) await modal.getByRole('button', { name: 'Close' }).click();
  await game.waitForTimeout(1500);
  console.log('--- terminal after connecting:\n' + (await terminalText(game)));
  await input.click();
  await input.fill(code);
  await input.press('Enter');
  await game.waitForTimeout(3500);
  console.log('--- terminal after the access code:\n' + (await terminalText(game)).replace(code, '<code>'));
  await game.screenshot({ path: path.join(OUT, 'phase-29e_explore.png') });
});
