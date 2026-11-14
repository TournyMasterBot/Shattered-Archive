// Phase 29e: walk the SIMULACRUM (the owner's own experimental MUD, on this machine only) so its map grows. Never the DSL: the script dials only the
// simulacrum relay, and the character is a throwaway one made for this (Zzmapwalker; its password is made here and kept in the git-ignored
// simulacrum-walker.local.json next to the plan).
//   node simulacrum-walk.mjs <test-account.local.json> <walker credentials file> <steps> <out folder>
// Signs in to the Simulacrum site, connects the game client to the relay, types the access code, then answers the ROM prompts (login, or the
// creation of the character), then walks: each step takes a random exit of the room it is in from the "[Exits: ...]" line, avoiding an immediate
// step back when there is another way. The game-server logs every view; `replay:world --world sandbox` turns that log into the map. No credential is printed.
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [accountFile, walkerFile, stepsArg, OUT] = process.argv.slice(2);
const STEPS = Number(stepsArg ?? 300);
const account = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const SIM_HOST = 'simulacrum-server.shatteredarchive.dev'; // the only relay this script ever dials
const SIM_PORT = '65001';

let walker;
if (fs.existsSync(walkerFile)) walker = JSON.parse(fs.readFileSync(walkerFile, 'utf8'));
else {
  walker = { name: 'Zzmapwalker', password: crypto.randomBytes(9).toString('hex'), createdAt: new Date().toISOString(), note: 'throwaway Simulacrum character for map walking; local machine only' };
  fs.writeFileSync(walkerFile, JSON.stringify(walker, null, 2));
}

const SHORT = { north: 'n', south: 's', east: 'e', west: 'w', up: 'u', down: 'd' };
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e', u: 'd', d: 'u' };
const screen = (page) => page.evaluate(() => (document.querySelector('.xterm-rows')?.innerText ?? '').replace(/\u00a0/g, ' '));
const tail = (text, n = 8) => text.split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-n);

await withPage('https://simulacrum.shatteredarchive.dev/', async (page) => {
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

  const send = async (text) => {
    await input.click();
    await input.fill(text);
    await input.press('Enter');
  };
  await send(code);

  // ---- the ROM prompts: login or creation, then in the world ----
  // each is matched against the LAST line on the screen only (an older prompt stays visible above the answer)
  const answers = [
    [/By what name do you wish to be known\?/i, () => walker.name, 'name'],
    [/Did I get that right.*\(Y\/N\)/i, () => 'y', 'name confirmed'],
    [/Give me a password for/i, () => walker.password, 'new password'],
    [/retype password/i, () => walker.password, 'retype password'],
    [/^Password:/i, () => walker.password, 'password'],
    [/What is your race/i, () => 'human', 'race'],
    [/(What is your sex|Does the sex .* matter|\(M\/F\))/i, () => 'm', 'sex'],
    [/Select a class/i, () => 'warrior', 'class'],
    [/(customize this character|^Customize \(Y\/N\))/i, () => 'n', 'customize'],
    [/Which alignment/i, () => 'g', 'alignment'],
    [/(Please pick a weapon|Your choice\?)/i, () => 'sword', 'weapon'],
    [/(Hit|Press) (Return|Enter)/i, () => '', 'continue'],
    [/(reconnect|already playing)/i, () => 'y', 'reconnect'],
  ];
  let inWorld = false;
  let answeredLine = '';
  let idle = 0;
  for (let i = 0; i < 120 && !inWorld; i += 1) {
    await game.waitForTimeout(800);
    const text = await screen(game);
    const lines = tail(text, 14);
    const lastLine = lines[lines.length - 1] ?? '';
    // the game's own prompt (<20hp 100m 100mv>) means the character is in the world
    if (/^<\d+(\/\d+)?hp \d+(\/\d+)?m \d+(\/\d+)?mv/i.test(lastLine)) {
      inWorld = true;
      break;
    }
    const hit = answers.find(([re]) => re.test(lastLine));
    if (hit && lastLine !== answeredLine) {
      answeredLine = lastLine;
      idle = 0;
      console.log(`  prompt: ${hit[2]}`);
      await send(hit[1]());
      await game.waitForTimeout(400);
    } else if (++idle % 10 === 0) {
      console.log('  waiting; the screen ends with:\n    ' + lines.slice(-5).map((l) => l.slice(0, 100)).join('\n    '));
    }
  }
  console.log('in the world:', inWorld);
  if (!inWorld) throw new Error('did not reach a room: see the prompts above');
  // the walk reads the exits line, which the game only prints with autoexit on (it is a toggle: look, and flip it once if there is no line)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await send('look');
    await game.waitForTimeout(1200);
    if (tail(await screen(game), 14).some((l) => /\[Exits:/i.test(l))) break;
    await send('autoexit');
    await game.waitForTimeout(1000);
  }

  // ---- the walk ----
  let previous = null;
  let steps = 0;
  let stuck = 0;
  const visits = new Map();
  /** The movement points in the latest prompt (<20hp 100m 100mv>), or null. */
  const movement = (lines) => {
    const prompt = [...lines].reverse().find((l) => /^<\d+(\/\d+)?hp \d+(\/\d+)?m \d+(\/\d+)?mv/i.test(l));
    const m = prompt ? /(\d+)(?:\/\d+)?mv/i.exec(prompt) : null;
    return m ? Number(m[1]) : null;
  };
  let rests = 0;
  while (steps < STEPS && stuck < 12) {
    const text = await screen(game);
    const lines = tail(text, 40);
    const mv = movement(lines);
    if (mv !== null && mv < 15) {
      // out of movement points: sleep until they are back (the school is safe), then stand up and go on
      rests += 1;
      await send('sleep');
      for (let w = 0; w < 40; w += 1) {
        await game.waitForTimeout(8000);
        await send('');
        await game.waitForTimeout(400);
        if ((movement(tail(await screen(game), 40)) ?? 0) >= 80) break;
      }
      await send('stand');
      await game.waitForTimeout(800);
      continue;
    }
    const exitsLine = [...lines].reverse().find((l) => /\[Exits:/i.test(l));
    const exits = exitsLine ? [...exitsLine.matchAll(/\b(north|south|east|west|up|down)\b/gi)].map((m) => SHORT[m[1].toLowerCase()]) : [];
    if (exits.length === 0) {
      stuck += 1;
      await game.waitForTimeout(700);
      continue;
    }
    const key = `${lines.filter((l) => !/^</.test(l) && !/\[Exits:/.test(l)).slice(-6, -4).join('|')}|${exits.join('')}`;
    visits.set(key, (visits.get(key) ?? 0) + 1);
    const back = previous ? OPPOSITE[previous] : null;
    const options = exits.length > 1 ? exits.filter((d) => d !== back) : exits;
    const choice = options[crypto.randomInt(options.length)];
    await send(choice);
    previous = choice;
    steps += 1;
    const before = text;
    for (let w = 0; w < 10; w += 1) {
      await game.waitForTimeout(250);
      if ((await screen(game)) !== before) break;
    }
    if (steps % 50 === 0) console.log(`  steps ${steps}, distinct places so far ${visits.size}`);
  }
  console.log(`walked ${steps} steps; ${visits.size} distinct places; rests ${rests}; stuck ${stuck}`);
  await game.screenshot({ path: path.join(OUT, 'phase-29e_walker-end.png') });
  await send('quit');
  await game.waitForTimeout(1500);
});
