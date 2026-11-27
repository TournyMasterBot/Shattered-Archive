// Live check (Phase 2): a dropped connection stops a running autopilot in the built web client.
// Run after building:  node <item folder>/tools/web-autopilot-drop-check.mjs
import path from 'node:path';
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { ORIGIN, shots, contextOptions, standIn, checker } from './standin.mjs';

const { check, finish } = checker();

await withPage(
  `${ORIGIN}/`,
  async (page) => {
    const game = await standIn(page, {
      'autoleveling-config-v3:dsl-mud': {
        version: 3,
        mode: 'auto_level',
        loopRounds: true,
        moveSettleMs: 0,
        lookSettleMs: 0,
        roundLoopTimeMs: 3000,
        init: { trainingPath: 'n;s', targets: [] },
      },
    });
    const start = () => page.evaluate(() => window.dispatchEvent(new CustomEvent('shatteredarchive:autoleveling-start', { detail: {} })));

    await game.connect();
    game.loginData();
    await page.waitForTimeout(500);
    game.clear();

    // the start is refused unless the autopilot hook saw the socket open (its keys used to be the sandbox hook's)
    await start();
    await page.waitForTimeout(2500);
    check(game.sent.length > 0, `the run started and is sending (${game.sent.length} commands)`);

    game.socket().close();
    await page.waitForTimeout(700);
    game.clear();
    await page.waitForTimeout(9000);
    check(game.sent.length === 0, 'disconnected: the run sends nothing');
    check((await game.terminalText()).includes('connection lost: the run was stopped'), 'disconnected: the terminal says the run was stopped');

    await game.connect();
    game.loginData();
    await page.waitForTimeout(8000);
    check(game.sent.length === 0, 'reconnected and logged in: the run does not start again by itself');
    await page.screenshot({ path: path.join(shots, 'phase-02_autopilot-stopped.png') });
  },
  { contextOptions },
);

finish();
