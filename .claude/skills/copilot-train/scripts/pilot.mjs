#!/usr/bin/env node
/**
 * The training pilot: a VISIBLE browser window that signs in to the Simulacrum, plays the throwaway character, turns Claude training on in the
 * Copilot window and then answers Copilot's suggestions as Claude directs, through two files in the rendezvous folder:
 *
 *   pending.json   written by the pilot: the suggestion on screen (id, command, rationale, kind, sphere, situation) and the end of the game screen
 *   answer.json    written by Claude: { id, action: approve | correct | reject | wait, command?, why? } or { action: stop }  (see lib/answers.mjs)
 *   error.json     written by the pilot when an answer is refused (what is wrong); the pilot keeps waiting for a better one
 *
 *   node .claude/skills/copilot-train/scripts/pilot.mjs --account <test-account.local.json> --character <character.local.json> \
 *        --dir <rendezvous folder> --session <session log .jsonl> [--max-minutes 60]
 *
 * The window is always visible (lib/headed.mjs refuses a hidden one) so the owner can watch every screen. The pilot dials only the Simulacrum.
 * It never starts the game server, the Copilot server or a model; those are the owner's. Training turns itself off when the pilot ends.
 */
/* global console, process, setTimeout */
import fs from 'node:fs';
import path from 'node:path';
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { validateAnswer } from './lib/answers.mjs';
import { pilotLaunchOptions } from './lib/headed.mjs';
import { enterSimulacrum, loadCharacter, screenText, SIM_SITE, tailLines } from './lib/simulacrum.mjs';
import { appendEntry, entryFor } from './lib/sessionLog.mjs';
import { applyAnswer, readCards, startTraining, stopTraining } from './lib/ui.mjs';

function argument(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const need = (name) => {
  const value = argument(name);
  if (value === undefined) throw new Error(`--${name} is required`);
  return value;
};

const account = JSON.parse(fs.readFileSync(need('account'), 'utf8'));
const character = loadCharacter(need('character'));
const dir = path.resolve(need('dir'));
const sessionFile = path.resolve(need('session'));
const maxMs = Number(argument('max-minutes', '60')) * 60_000;
fs.mkdirSync(dir, { recursive: true });
const pendingFile = path.join(dir, 'pending.json');
const answerFile = path.join(dir, 'answer.json');
const errorFile = path.join(dir, 'error.json');
const log = (text) => console.log(`[pilot ${new Date().toISOString().slice(11, 19)}] ${text}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const launch = pilotLaunchOptions(process.argv.slice(2), process.env); // throws when a hidden browser was asked for
for (const file of [pendingFile, answerFile, errorFile]) fs.rmSync(file, { force: true });

await withPage(
  SIM_SITE,
  async (page) => {
    const { game } = await enterSimulacrum(page, { account, character, log });
    await page.close(); // only the game client stays, in front, where the owner watches
    await game.bringToFront();
    await startTraining(game);
    log('training is on; waiting for suggestions');

    const started = Date.now();
    let stopping = false;
    const seen = new Set();
    while (!stopping && Date.now() - started < maxMs) {
      const cards = await readCards(game);
      const card = cards.find((c) => !seen.has(c.id));
      if (!card) {
        await sleep(1500);
        continue;
      }
      const screen = tailLines(await screenText(game), 25);
      fs.writeFileSync(pendingFile, JSON.stringify({ ...card, screen, at: new Date().toISOString() }, null, 2));
      log(`pending ${card.id}: ${card.command}  (${card.sphere}/${card.kind}) — waiting for answer.json`);

      let applied = false;
      while (!applied && !stopping && Date.now() - started < maxMs) {
        await sleep(500);
        if (!fs.existsSync(answerFile)) continue;
        let raw;
        try {
          raw = JSON.parse(fs.readFileSync(answerFile, 'utf8'));
        } catch {
          continue; // half-written: read it again in a moment
        }
        const checked = validateAnswer(raw, card.id);
        fs.rmSync(answerFile, { force: true });
        if (!checked.ok) {
          fs.writeFileSync(errorFile, JSON.stringify({ id: card.id, problem: checked.problem }, null, 2));
          log(`answer refused: ${checked.problem}`);
          continue;
        }
        fs.rmSync(errorFile, { force: true });
        const answer = checked.answer;
        if (answer.action === 'stop') {
          stopping = true;
          break;
        }
        if (answer.action === 'wait') {
          await sleep(5000);
          break; // read the cards again: the situation moved on
        }
        await applyAnswer(game, card, answer);
        appendEntry(sessionFile, entryFor(card, answer, Date.now()));
        seen.add(card.id);
        fs.rmSync(pendingFile, { force: true });
        log(`${answer.action} ${card.id}`);
        applied = true;
        await sleep(1200);
      }
    }
    await stopTraining(game);
    log('training is off; the session ended');
  },
  launch,
);
