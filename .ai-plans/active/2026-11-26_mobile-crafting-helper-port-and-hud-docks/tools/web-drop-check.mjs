// Live check of the web client across a dropped connection (Phase 1, again in Phases 2 and 12).
//
// Run after building (see standin.mjs):  node <item folder>/tools/web-drop-check.mjs [--showcase]
import path from 'node:path';
import { withPage, saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { ORIGIN, SLUG, shots, contextOptions, standIn, checker } from './standin.mjs';

const showcase = process.argv.includes('--showcase');
const TIMER_MS = 2000;
const { check, finish } = checker();

await withPage(
  `${ORIGIN}/`,
  async (page) => {
    const game = await standIn(page, {
      'shatteredArchive.userScripts.dsl-mud': [
        { id: 'drop-check-timer', kind: 'timer', name: 'drop check', enabled: true, language: 'javascript', source: 'sendCommand("timer-fired")', intervalMs: TIMER_MS },
      ],
    });
    const { connect, count, terminalText, loginData } = game;
    const type = async (line) => {
      const input = page.locator('textarea, input[type="text"]').last();
      await input.click();
      await input.fill(line);
      await input.press('Enter');
    };

    // ---- first session ----
    await page.waitForTimeout(TIMER_MS * 2);
    check(game.sent.length === 0, 'before connecting: nothing is sent');
    check(!(await terminalText()).includes('> timer-fired'), 'before connecting: the timer echoes nothing');

    await connect();
    loginData();
    await page.waitForTimeout(TIMER_MS * 2 + 600);
    check(count('timer-fired') >= 2, `connected: the timer sends (${count('timer-fired')} times)`);

    await type('doAfter(6000, world, delayed-command)');
    await page.waitForTimeout(500);

    // ---- drop ----
    const sendingSocket = game.socket();
    game.clear();
    sendingSocket.close();
    await page.waitForTimeout(700);
    const echoesAtDrop = (await terminalText()).split('> timer-fired').length;
    await page.waitForTimeout(8000);
    check(game.sent.length === 0, 'disconnected for 8 s: nothing reaches the server');
    check((await terminalText()).split('> timer-fired').length === echoesAtDrop, 'disconnected: no command is echoed in the terminal');
    check((await terminalText()).includes('[Timers] Disconnected — timers paused, 1 delayed command cancelled'), 'disconnected: the terminal says what stopped');
    await page.screenshot({ path: path.join(shots, 'phase-01_timers-paused.png') });
    if (showcase) {
      await saveShowcase(page, SLUG, '06-web-timers-paused', {
        description: 'Web client after a dropped connection: timers paused and the delayed command cancelled',
      });
    }

    // ---- reconnect, login prompt ----
    await connect();
    await page.waitForTimeout(TIMER_MS * 2 + 600);
    check(game.sent.length === 0, 'reconnected, not logged in: no timer and no cancelled command');
    check((await terminalText()).includes('[Timers] Connected — timers wait until your character is in the game'), 'reconnected: the terminal says the timers are waiting');

    loginData();
    await page.waitForTimeout(TIMER_MS - 800);
    check(count('timer-fired') === 0, 'logged in: a full interval passes before the first run');
    await page.waitForTimeout(1500);
    check(count('timer-fired') >= 1, 'logged in: the timer runs again');
    check(count('delayed-command') === 0, 'the delayed command from before the drop never fires');
    check((await terminalText()).includes('[Timers] Timers resumed'), 'logged in: the terminal says the timers resumed');
    await page.screenshot({ path: path.join(shots, 'phase-01_timers-resumed.png') });

    // ---- player help ----
    await page.locator('xpath=//div[normalize-space(text())="Help"]').first().click();
    await page.locator('xpath=//div[normalize-space(text())="Scripting…"]').first().click();
    const heading = page.getByRole('heading', { name: 'When the connection drops' });
    await heading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    check(await heading.isVisible(), 'help: the dropped-connection section is shown');
    await page.screenshot({ path: path.join(shots, 'phase-01_help.png') });
    if (showcase) {
      await saveShowcase(page, SLUG, '08-web-scripting-help-timers', {
        description: 'Web scripting help: what a dropped connection does to timers and delayed commands',
      });
    }
  },
  { contextOptions },
);

finish();
