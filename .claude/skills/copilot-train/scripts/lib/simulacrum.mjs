/* global document */
/**
 * Getting into the Simulacrum like a player: sign in to its site with the test account, take the one-time access code, connect the game client to
 * the Simulacrum's relay (the only game host the pilot ever dials), type the code, and answer the ROM login or creation prompts for a THROWAWAY
 * character. Nothing here names or reaches the production game, and no credential is printed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

export const SIM_SITE = 'https://simulacrum.shatteredarchive.dev/';
export const GAME_CLIENT = 'https://game-client.shatteredarchive.dev/';
export const SIM_HOST = 'simulacrum-server.shatteredarchive.dev';
export const SIM_PORT = '65001';

/** The throwaway character: read from the git-ignored file, or made (with a random password) the first time. */
export function loadCharacter(file, name = 'Zztrainee') {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const made = { name, password: crypto.randomBytes(9).toString('hex'), createdAt: new Date().toISOString(), note: 'throwaway Simulacrum character for Copilot training; local machine only' };
  fs.writeFileSync(file, JSON.stringify(made, null, 2));
  return made;
}

export const screenText = (page) => page.evaluate(() => (document.querySelector('.xterm-rows')?.innerText ?? '').replaceAll(String.fromCharCode(160), ' '));
export const tailLines = (text, n = 8) => text.split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-n);

/** The prompts of the ROM login and character creation, matched against the LAST line on the screen only. */
export function promptAnswers(character) {
  return [
    [/By what name do you wish to be known\?/i, () => character.name, 'name'],
    [/Did I get that right.*\(Y\/N\)/i, () => 'y', 'name confirmed'],
    [/Give me a password for/i, () => character.password, 'new password'],
    [/retype password/i, () => character.password, 'retype password'],
    [/^Password:/i, () => character.password, 'password'],
    [/What is your race/i, () => 'human', 'race'],
    [/(What is your sex|Does the sex .* matter|\(M\/F\))/i, () => 'm', 'sex'],
    [/Select a class/i, () => 'warrior', 'class'],
    [/(customize this character|^Customize \(Y\/N\))/i, () => 'n', 'customize'],
    [/Which alignment/i, () => 'g', 'alignment'],
    [/(Please pick a weapon|Your choice\?)/i, () => 'sword', 'weapon'],
    [/(Hit|Press) (Return|Enter)/i, () => '', 'continue'],
    [/(reconnect|already playing)/i, () => 'y', 'reconnect'],
  ];
}

const IN_WORLD = /^<\d+(\/\d+)?hp \d+(\/\d+)?m \d+(\/\d+)?mv/i;

/**
 * Signs in, connects and logs the character in. Returns the visible game page (brought to the front) and a `send` that types a line into the game.
 * `log` receives plain progress lines.
 */
export async function enterSimulacrum(page, { account, character, log }) {
  const context = page.context();
  await page.getByRole('link', { name: /sign in/i }).click();
  await page.locator('input').first().fill(account.username);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: /^Continue as/ }).click();
  await page.waitForURL(/simulacrum\.shatteredarchive\.dev/, { timeout: 15000 });
  await page.getByRole('button', { name: 'Get access code' }).click();
  const code = (await page.locator('.code').textContent({ timeout: 10000 }))?.trim() ?? '';

  const game = await context.newPage();
  await game.goto(GAME_CLIENT);
  await game.waitForLoadState('networkidle');
  await game.bringToFront();
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

  const send = async (text) => {
    await input.click();
    await input.fill(text);
    await input.press('Enter');
  };
  await send(code);

  const answers = promptAnswers(character);
  let inWorld = false;
  let answered = '';
  for (let i = 0; i < 120 && !inWorld; i += 1) {
    await game.waitForTimeout(800);
    const lines = tailLines(await screenText(game), 14);
    const last = lines[lines.length - 1] ?? '';
    if (IN_WORLD.test(last)) {
      inWorld = true;
      break;
    }
    const hit = answers.find(([re]) => re.test(last));
    if (hit && last !== answered) {
      answered = last;
      log(`prompt: ${hit[2]}`);
      await send(hit[1]());
      await game.waitForTimeout(400);
    }
  }
  if (!inWorld) throw new Error('did not reach a room: the prompts above show where it stopped');
  return { game, send };
}
