// Phase 40 probe: what does the map window do on a REAL connection to the Simulacrum? Connects with the throwaway walker character (never the
// DSL), records the game:room-data events the client receives (title and exits only), opens the Map window and reports its status line.
//   node map-live-probe.mjs <test-account.local.json> <walker credentials file> <out folder>
/* global window */
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { enterSimulacrum, loadCharacter } from 'file:///C:/Projects/ShatteredArchive/.claude/skills/copilot-train/scripts/lib/simulacrum.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [accountFile, walkerFile, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const account = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
const character = loadCharacter(walkerFile, 'Zzmapwalker');
const log = (t) => console.log(`[probe] ${t}`);

await withPage('https://simulacrum.shatteredarchive.dev/', async (page) => {
  const { game, send } = await enterSimulacrum(page, { account, character, log });
  await game.evaluate(() => {
    window.__rooms = [];
    window.addEventListener('game:room-data', (e) => window.__rooms.push({ room: e.detail?.room, exits: e.detail?.exits, keys: Object.keys(e.detail ?? {}) }));
  });
  await game.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
  await game.getByText('Map…', { exact: false }).first().click();
  const win = game.getByRole('dialog', { name: 'Map' });
  await win.waitFor({ state: 'visible' });
  await game.waitForTimeout(2500);
  const status = async () => (await win.locator('[role="status"]').first().textContent())?.trim();
  log(`status right after opening (no new room yet): ${await status()}`);
  await send('look');
  await game.waitForTimeout(2500);
  log(`status after a look: ${await status()}`);
  const rooms = await game.evaluate(() => window.__rooms);
  log(`room-data events seen since: ${rooms.length}; first: ${JSON.stringify(rooms[0] ?? null)}`);
  await game.screenshot({ path: path.join(OUT, 'map-live-probe.png') });
});
