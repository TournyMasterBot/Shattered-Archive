// Phase 14: the settings panel and auto-approval, driven like a person against the dev stack, with the game client connected to
// SIMULACRUM only (never the real DSL host). The Copilot server is the live one; /state, /suggestions, /tickets, /decisions and
// /stats/buckets are answered by this script (page.route), so the owner's real ledger gets no test decisions and the "20 answers"
// boundary can be set exactly. Every request body the window sends is captured and checked.
import { withPage, saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
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
const API = 'https://copilot.shatteredarchive.dev';

const make = (id, command, kind, sphere, confidence) => ({
  id,
  character: 'Agate-U',
  createdAt: 1000 + Number(id.replace(/\D/g, '')),
  mode: 'exploration',
  sphere,
  kind,
  command,
  rationale: `Fixture ${id}: ${command} fits this room.`,
  confidence,
  confidenceSource: 'model',
  situationKey: `exploration:fixture-${id}`,
});

let pending = [];
let buckets = {};
let feedAge = 2; // seconds since the last text line; null = none yet
let feedStale = false;
const decisions = [];
const tickets = [];
const CORS = {
  'access-control-allow-origin': 'https://game-client.shatteredarchive.dev',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
};
const json = (body, status = 200) => ({ status, headers: CORS, body: JSON.stringify(body) });

await withPage(
  'https://simulacrum.shatteredarchive.dev/',
  async (page) => {
    const context = page.context();
    await page.getByRole('link', { name: /sign in/i }).click();
    await page.locator('input').first().fill(cred.username);
    await page.locator('input[type="password"]').fill(cred.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.getByRole('button', { name: /^Continue as/ }).click();
    await page.waitForURL(/simulacrum\.shatteredarchive\.dev/, { timeout: 15000 });
    await page.getByRole('button', { name: 'Get access code' }).click();
    const code = (await page.locator('.code').textContent({ timeout: 10000 }))?.trim() ?? '';
    check('simulacrum issued an access code', code.length >= 16);

    const game = await context.newPage();
    await game.setViewportSize({ width: 1440, height: 900 });
    await game.route(`${API}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (url.pathname === '/state') {
        return route.fulfill(
          json({
            connected: true,
            stale: feedStale,
            staleAfterSeconds: 60,
            lastEventAgeSeconds: feedAge,
            lastTextAgeSeconds: feedAge,
            inFight: false,
            room: null,
            vitals: null,
            feed: { lines: 1, events: 1, malformed: 0, oversize: 0, ignored: 0 },
            tail: { files: 1, lines: 1, resets: 0, renames: 0, oversize: 0, ioErrors: 0, consumerErrors: 0, scans: 1 },
          }),
        );
      }
      if (url.pathname === '/suggestions') return route.fulfill(json({ suggestions: pending }));
      if (url.pathname === '/stats/buckets') return route.fulfill(json({ buckets }));
      if (url.pathname === '/tickets' && req.method() === 'POST') {
        tickets.push(JSON.parse(req.postData() ?? '{}'));
        return route.fulfill(json({ ok: true, id: tickets.at(-1).id, written: true }, 201));
      }
      if (url.pathname === '/tickets') return route.fulfill(json({ tickets: [] }));
      if (url.pathname === '/decisions' && req.method() === 'POST') {
        const body = JSON.parse(req.postData() ?? '{}');
        decisions.push(body);
        if (body.outcome !== 'refused') pending = pending.filter((s) => s.id !== body.suggestionId); // the server keeps a refused one
        return route.fulfill(json({ ok: true, id: body.id, written: true }, 201));
      }
      return route.continue();
    });

    await game.goto('https://game-client.shatteredarchive.dev/');
    await game.waitForLoadState('networkidle');
    await game.evaluate(() => {
      window.__alive = 'same page'; // proves a reset needs no reload
      window.__sent = [];
      window.addEventListener('shatteredarchive:send-command', (e) => window.__sent.push(e.detail?.cmd));
    });
    await game.locator('[class*="menuItem"]').filter({ hasText: /^File/ }).first().click();
    await game.getByText('Connect…', { exact: true }).click();
    const modal = game.getByRole('dialog', { name: 'Connect to server' });
    await modal.getByLabel('Host').fill(SIM_HOST);
    await modal.getByLabel('Port').fill(SIM_PORT);
    await modal.getByRole('button', { name: /^Connect/ }).click();
    const input = game.locator('#game-command-input');
    await game.waitForFunction(() => !document.querySelector('#game-command-input')?.disabled, null, { timeout: 20000 });
    if (await modal.isVisible().catch(() => false)) await modal.getByRole('button', { name: 'Close' }).click();
    await input.click();
    await input.fill(code);
    await input.press('Enter');
    await game.waitForTimeout(2500);
    const sentNow = () => game.evaluate(() => [...window.__sent]);
    // the line the owner typed above is not Copilot's: only commands sent after this point count
    await game.evaluate(() => (window.__sent.length = 0));

    await game.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await game.getByText('Copilot…', { exact: true }).click();
    const dialog = game.getByRole('dialog', { name: 'Copilot' });
    await dialog.waitFor({ state: 'visible' });
    const card = (command) => dialog.getByRole('listitem', { name: `Suggestion ${command}` });
    const shot = async (name) => {
      const b = await dialog.boundingBox();
      await game.screenshot({ path: path.join(OUT, name), clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 24, height: b.height + 24 } });
    };
    // out of the way of the command row, then larger so the settings show together
    const title = dialog.getByText('Copilot', { exact: true }).first();
    const tb = await title.boundingBox();
    await game.mouse.move(tb.x + 5, tb.y + 5);
    await game.mouse.down();
    await game.mouse.move(tb.x - 700, tb.y - 40, { steps: 10 });
    await game.mouse.up();
    const wb = await dialog.boundingBox();
    await game.mouse.move(wb.x + wb.width - 6, wb.y + wb.height - 6);
    await game.mouse.down();
    await game.mouse.move(wb.x + wb.width + 150, wb.y + wb.height + 400, { steps: 10 });
    await game.mouse.up();

    const tab = (name) => dialog.getByRole('button', { name, exact: true });
    const settingsRegion = dialog.getByRole('region', { name: 'Copilot settings' });
    const waitUntil = async (fn, ms = 9000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await fn()) return true;
        await game.waitForTimeout(250);
      }
      return false;
    };

    // ---- 1. the settings tab ------------------------------------------------------------------------------------------------
    await tab('Settings').click();
    await settingsRegion.waitFor({ state: 'visible' });
    const boxes = dialog.locator('input[type="checkbox"]'); // every one in the DOM: the folded spheres are out of the accessibility tree
    check('the settings list a rule per sphere and kind a rule can enable (28), all off', (await boxes.count()) === 28 && (await dialog.locator('input[type="checkbox"]:checked').count()) === 0);
    check('every threshold slider starts disabled', (await dialog.locator('input[type="range"]:not(:disabled)').count()) === 0);
    check('the settings tab is pressed and the list tab is not', (await tab('Settings').getAttribute('aria-pressed')) === 'true' && (await tab('Suggestions').getAttribute('aria-pressed')) === 'false');
    check('World is open and the other spheres are folded', (await dialog.locator('details[open]').count()) === 1);

    // the floor: read only, with the reasons
    const floor = dialog.getByRole('region', { name: 'Always asks you' });
    const floorText = (await floor.textContent()) ?? '';
    check('the floor lists every always-ask kind with its reason', ['spend-or-lose', 'speak', 'irreversible', 'pk', 'unknown', 'fight-start-unknown', 'Speaks to other players', 'Attacks another player'].every((t) => floorText.includes(t)));
    check('the floor has no control to change', (await floor.locator('input, button, select, textarea').count()) === 0);
    check('no checkbox exists for a floor kind', (await dialog.getByLabel('Auto-approve world speak').count()) === 0 && (await dialog.getByLabel('Auto-approve things spend-or-lose').count()) === 0);

    // ---- 2. native controls follow the theme (H2) ------------------------------------------------------------------------------
    await dialog.getByLabel('Auto-approve world move').check();
    const styleOf = (loc) =>
      loc.evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, scheme: s.colorScheme, accent: s.accentColor, caret: s.caretColor };
      });
    const select = dialog.getByRole('combobox');
    const selStyle = await styleOf(select);
    check('the mode select is dark with light text and color-scheme dark (its popup follows)', selStyle.scheme === 'dark' && selStyle.bg === 'rgb(16, 16, 16)' && selStyle.color === 'rgb(240, 240, 240)', JSON.stringify(selStyle));
    const staleBox = dialog.getByLabel('Treat the game as quiet after (seconds)');
    const numStyle = await styleOf(staleBox);
    check('the number input is dark with light text, a visible caret and color-scheme dark', numStyle.scheme === 'dark' && numStyle.bg === 'rgb(16, 16, 16)' && numStyle.color === 'rgb(240, 240, 240)' && numStyle.caret === 'rgb(240, 240, 240)', JSON.stringify(numStyle));
    const cbStyle = await styleOf(dialog.getByLabel('Auto-approve world move'));
    const rgStyle = await styleOf(dialog.getByLabel('Threshold for world move'));
    check('the checkbox and the slider use the accent colour and color-scheme dark', cbStyle.accent === 'rgb(139, 195, 74)' && rgStyle.accent === 'rgb(139, 195, 74)' && cbStyle.scheme === 'dark' && rgStyle.scheme === 'dark', JSON.stringify({ cbStyle, rgStyle }));
    check('the slider is enabled once its rule is on', await dialog.getByLabel('Threshold for world move').isEnabled());

    // ---- 3. move the threshold with the keyboard, set the quiet limit ------------------------------------------------------------
    const slider = dialog.getByLabel('Threshold for world move');
    await slider.focus();
    for (let i = 0; i < 10; i += 1) await game.keyboard.press('ArrowLeft');
    check('ten steps left of 0.90 reads 0.80', ((await settingsRegion.textContent()) ?? '').includes('0.80'));
    await staleBox.fill('300');
    await staleBox.blur();
    check('the quiet limit keeps what was typed', (await staleBox.inputValue()) === '300');
    await staleBox.fill('3');
    check('a quiet limit under 5 shows a message', ((await settingsRegion.textContent()) ?? '').includes('Use a whole number from 5 to 3600.'));
    await staleBox.blur();
    check('and shows the stored value again when the field loses focus', (await staleBox.inputValue()) === '300');
    const stored = await game.evaluate(() => localStorage.getItem('copilot.settings.v1'));
    check('only what differs from the defaults is stored', stored === JSON.stringify({ schemaVersion: 1, staleAfterSeconds: 300, rules: { 'world:move': { enabled: true, threshold: 0.8 } } }), String(stored));

    // the earned history beside the rule
    buckets = { 'world:move': { approved: 19, total: 19 } };
    await tab('Suggestions').click();
    await tab('Settings').click();
    await waitUntil(async () => ((await settingsRegion.textContent()) ?? '').includes('19 of 20 answers'));
    check('the rule row shows how far the bucket is from 20 answers', ((await settingsRegion.textContent()) ?? '').includes('19 of 20 answers'));
    await shot('phase-14_settings.png');
    await saveShowcase(game, 'copilot-settings', '01-settings', { locator: dialog, description: 'The Copilot settings tab: one rule switched on with its threshold and the history beside it, the quiet limit, and the always-ask list with no controls.' });

    // ---- 4. 19 answers: asks; the list is behind the settings ----------------------------------------------------------------------
    pending = [make('s1', 'north', 'move', 'world', 0.95)];
    await tab('Suggestions').click();
    await card('north').waitFor({ state: 'visible', timeout: 10000 });
    await game.waitForTimeout(2500); // a poll or two, and the decision
    check('19 answers back the rule: the suggestion asks, nothing is sent', (await sentNow()).length === 0 && decisions.length === 0 && (await card('north').isVisible()));

    // ---- 5. 20 answers: runs by itself ----------------------------------------------------------------------------------------------
    buckets = { 'world:move': { approved: 20, total: 20 } };
    pending = [make('s2', 'south', 'move', 'world', 0.95)];
    const ran = await waitUntil(async () => decisions.some((d) => d.outcome === 'auto'));
    check('20 answers back the rule: the next suggestion runs by itself', ran);
    const auto = decisions.find((d) => d.outcome === 'auto');
    check('it was recorded as auto with the rule, the command and the bucket', auto?.suggestionId === 's2' && auto?.rule === 'world:move' && auto?.command === 'south' && auto?.sphere === 'world' && auto?.kind === 'move', JSON.stringify(auto));
    check('it was sent to the game once, through the page', JSON.stringify(await sentNow()) === JSON.stringify(['south']), JSON.stringify(await sentNow()));
    check('its card is gone and the log says Auto (world:move) south', !(await card('south').isVisible().catch(() => false)) && ((await dialog.getByLabel('Session log').textContent()) ?? '').includes('Auto (world:move) south'));
    await shot('phase-14_auto.png');
    await saveShowcase(game, 'copilot-settings', '02-auto-run-log', { locator: dialog, description: 'The session log after a rule ran a suggestion by itself: Auto (world:move) south.' });

    // ---- 6. the floor and the unknown never run, whatever is on --------------------------------------------------------------------
    pending = [make('s3', 'say hello', 'speak', 'interaction', 0.99)];
    await card('say hello').waitFor({ state: 'visible', timeout: 10000 });
    await game.waitForTimeout(2500);
    check('a floor command (speak) is never sent by itself', !(await sentNow()).includes('say hello') && !decisions.some((d) => d.suggestionId === 's3'));
    pending = [make('s4', 'group all', 'unknown', 'world', 0.9)];
    const filed = await waitUntil(async () => tickets.length > 0);
    check('a command it cannot place files one ticket and sends nothing', filed && tickets[0].id === 't-s4' && tickets[0].reason === 'unknown-situation' && !(await sentNow()).includes('group all'), JSON.stringify(tickets[0]));
    check('the ticket text holds no command', !JSON.stringify(tickets[0]).includes('group all'));

    // ---- 7. a stale feed: nothing runs by itself --------------------------------------------------------------------------------------
    feedStale = true;
    const before = (await sentNow()).length;
    pending = [make('s5', 'east', 'move', 'world', 0.95)];
    await card('east').waitFor({ state: 'visible', timeout: 10000 });
    await game.waitForTimeout(2500);
    check('with the text feed stale a ready rule still asks', (await sentNow()).length === before && (await card('east').isVisible()));
    feedStale = false;
    pending = [];
    await game.waitForTimeout(3500);

    // ---- 8. the gate: typing blocks it, and the suggestion stays for the owner ----------------------------------------------------------
    pending = [];
    await game.waitForTimeout(3500);
    const typing = input.pressSequentially('abcdefghijklmnopqrstu', { delay: 400 }); // about 8 s of keystrokes
    await game.waitForTimeout(500);
    pending = [make('s6', 'west', 'move', 'world', 0.95)];
    const refused = await waitUntil(async () => decisions.some((d) => d.outcome === 'refused'), 8000);
    await typing;
    check('typing makes the gate refuse; it is recorded as refused with the reason', refused && decisions.find((d) => d.outcome === 'refused')?.rule === 'user-typing', JSON.stringify(decisions.find((d) => d.outcome === 'refused')));
    check('the refused suggestion stays on the list for the owner', await card('west').isVisible());
    check('and the log says it is waiting for the owner', ((await dialog.getByLabel('Session log').textContent()) ?? '').includes('waiting for you'));
    check('west was not sent', !(await sentNow()).includes('west'));
    await input.fill('');
    await game.waitForTimeout(2500); // past the typing window
    await card('west').getByRole('button', { name: 'Approve' }).click();
    await card('west').waitFor({ state: 'detached', timeout: 8000 });
    check('the owner can still approve it by hand afterwards', (await sentNow()).includes('west') && decisions.some((d) => d.outcome === 'approved' && d.suggestionId === 's6'));
    check('it ran once only: no second auto record for it', decisions.filter((d) => d.suggestionId === 's6' && d.outcome === 'auto').length === 0);

    // ---- 9. the settings survive a reload; reset puts the defaults back without one --------------------------------------------------
    await game.reload();
    await game.waitForLoadState('networkidle');
    await game.evaluate(() => (window.__alive = 'same page'));
    await game.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await game.getByText('Copilot…', { exact: true }).click();
    await dialog.waitFor({ state: 'visible' });
    await tab('Settings').click();
    check('the rule and the quiet limit survive a reload', (await dialog.getByLabel('Auto-approve world move').isChecked()) && (await dialog.getByLabel('Treat the game as quiet after (seconds)').inputValue()) === '300');
    await dialog.getByRole('button', { name: 'Reset to defaults' }).click();
    const confirm = dialog.getByRole('alertdialog', { name: 'Reset settings' });
    await confirm.waitFor({ state: 'visible' });
    await shot('phase-14_reset.png');
    await confirm.getByRole('button', { name: 'Keep my settings' }).click();
    check('Keep my settings leaves everything as it was', await dialog.getByLabel('Auto-approve world move').isChecked());
    await dialog.getByRole('button', { name: 'Reset to defaults' }).click();
    await confirm.getByRole('button', { name: 'Reset' }).click();
    check('Reset switches every rule off and restores the quiet limit', (await dialog.locator('input[type="checkbox"]:checked').count()) === 0 && (await dialog.getByLabel('Treat the game as quiet after (seconds)').inputValue()) === '60');
    check('and removes what was stored', (await game.evaluate(() => localStorage.getItem('copilot.settings.v1'))) === null);
    check('without reloading the page', (await game.evaluate(() => window.__alive)) === 'same page');

    // a second tab changes the settings; this one follows
    const other = await context.newPage();
    await other.goto('https://game-client.shatteredarchive.dev/');
    await other.evaluate(() => localStorage.setItem('copilot.settings.v1', JSON.stringify({ schemaVersion: 1, rules: { 'fighting:fight-continue': { enabled: true, threshold: 0.7 } } })));
    await other.close();
    await game.bringToFront();
    const followed = await waitUntil(async () => dialog.getByLabel('Auto-approve fighting fight-continue').isChecked().catch(() => false), 4000);
    check('a change made in another tab appears here without a reload', followed);
  },
  { contextOptions: { viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true } },
);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
