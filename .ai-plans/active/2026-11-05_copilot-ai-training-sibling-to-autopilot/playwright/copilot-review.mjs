// Phase 13: the suggestion review, driven like a person against the dev stack, with the game client connected to SIMULACRUM only
// (never the real DSL host). The Copilot server is the live one for /state; /suggestions, /tickets and /decisions are answered by this
// script (page.route), so the owner's real ledger gets no test decisions, and every request body the window sends is captured and checked.
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

const make = (n, command, kind, sphere, confidence, source = 'model') => ({
  id: `s${n}`,
  character: 'Agate-U',
  createdAt: 1000 + n,
  mode: 'exploration',
  sphere,
  kind,
  command,
  rationale: `Fixture ${n}: ${command} fits this room.`,
  confidence,
  confidenceSource: source,
  situationKey: `exploration:fixture-room-${n}`,
});
const fixtures = () => [
  make(1, 'look', 'info', 'world', 0.92),
  make(2, 'north', 'move', 'world', 0.55, 'map-evidence'),
  make(3, 'kill rat', 'fight-start-unknown', 'fighting', 0.4),
];
const extras = () => [
  make(4, 'scan', 'info', 'world', 0.9),
  make(5, 'inventory', 'info', 'things', null),
  make(6, 'equipment', 'info', 'things', 0.8),
  make(7, 'where', 'info', 'world', 0.7),
  make(8, 'score', 'info', 'interaction', 0.6),
];

let pending = fixtures();
let offline = false;
const posted = [];
const CORS = {
  'access-control-allow-origin': 'https://game-client.shatteredarchive.dev',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
};

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
      if (url.pathname === '/suggestions') {
        if (offline) return route.abort('failed');
        return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ suggestions: pending }) });
      }
      if (url.pathname === '/tickets') {
        if (offline) return route.abort('failed');
        const tickets = posted.filter((d) => d.outcome === 'corrected').map((d, i) => ({ id: `t${i}`, createdAt: 1, character: 'Agate-U', reason: 'correction-not-understood', sphere: 'world', kind: 'unknown', situationKey: 'x', summary: 'fixture', status: 'open' }));
        return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ tickets }) });
      }
      if (url.pathname === '/decisions' && req.method() === 'POST') {
        const body = JSON.parse(req.postData() ?? '{}');
        posted.push(body);
        pending = pending.filter((s) => s.id !== body.suggestionId);
        return route.fulfill({ status: 201, headers: CORS, body: JSON.stringify({ ok: true, id: body.id, written: true }) });
      }
      return route.continue(); // /state and everything else: the live Copilot server
    });

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
    await input.click();
    await input.fill(code);
    await input.press('Enter');
    await game.waitForTimeout(2500);

    // everything the page sends to the game, observed on its own event bus
    await game.evaluate(() => {
      window.__sent = [];
      window.addEventListener('shatteredarchive:send-command', (e) => window.__sent.push(e.detail?.cmd));
    });
    const sentNow = () => game.evaluate(() => [...window.__sent]);

    await game.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await game.getByText('Copilot…', { exact: true }).click();
    const dialog = game.getByRole('dialog', { name: 'Copilot' });
    await dialog.waitFor({ state: 'visible' });
    const card = (command) => dialog.getByRole('listitem', { name: `Suggestion ${command}` });
    // a picture of the window itself (with a margin), wherever it sits
    const shot = async (name) => {
      const b = await dialog.boundingBox();
      await game.screenshot({ path: path.join(OUT, name), clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 24, height: b.height + 24 } });
    };
    await card('look').waitFor({ state: 'visible', timeout: 10000 });

    // out of the way of the command row, then larger so three cards are visible together
    const title = dialog.getByText('Copilot', { exact: true }).first();
    const tb = await title.boundingBox();
    await game.mouse.move(tb.x + 5, tb.y + 5);
    await game.mouse.down();
    await game.mouse.move(tb.x - 560, tb.y - 40, { steps: 10 });
    await game.mouse.up();
    let wb = await dialog.boundingBox();
    await game.mouse.move(wb.x + wb.width - 6, wb.y + wb.height - 6);
    await game.mouse.down();
    await game.mouse.move(wb.x + wb.width + 150, wb.y + wb.height + 230, { steps: 10 });
    await game.mouse.up();

    // 1. what a card shows
    const lookCard = card('look');
    const text = (await lookCard.textContent()) ?? '';
    check('a card shows sphere, kind, command, rationale and confidence with its source', ['world', 'info', 'look', 'Fixture 1', 'Confidence 92% (model)'].every((t) => text.includes(t)), text.slice(0, 120));
    check('movement shows the map evidence as the confidence source', ((await card('north').textContent()) ?? '').includes('Confidence 55% (map evidence)'));
    check('the tickets count is shown', ((await dialog.textContent()) ?? '').includes('Open tickets: 0'));
    await shot('phase-13_review.png');
    await saveShowcase(game, 'copilot-review', '01-review-cards', { locator: dialog, description: 'The Copilot window listing three suggestions: sphere, kind, confidence with its source, the command, the rationale, and Approve, Correct and Reject.' });

    // 2. correct: the form, the counter, the disabled button, and how the why box looks
    await card('north').getByRole('button', { name: 'Correct' }).click();
    const send = card('north').getByRole('button', { name: 'Send correction' });
    check('Send correction is disabled with no why', await send.isDisabled());
    await card('north').getByLabel('Command to send instead').fill('exits');
    const why = card('north').getByLabel('Why (required)');
    await why.fill('ab');
    check('a why that is too short stays blocked and says so', (await send.isDisabled()) && ((await card('north').textContent()) ?? '').includes('at least 3'));
    await why.fill('Check the exits before walking blind.');
    check('the counter counts the characters', ((await card('north').textContent()) ?? '').includes('37/280'));
    const style = await why.evaluate((el) => {
      const s = getComputedStyle(el);
      const ph = getComputedStyle(el, '::placeholder');
      const sel = getComputedStyle(el, '::selection');
      return { color: s.color, bg: s.backgroundColor, caret: s.caretColor, scheme: s.colorScheme, placeholder: ph.color, selBg: sel.backgroundColor, selColor: sel.color };
    });
    console.log('why box style', JSON.stringify(style));
    check('why box: light text on a dark field, light caret, dark colour scheme', style.color === 'rgb(240, 240, 240)' && style.bg === 'rgb(16, 16, 16)' && style.caret === 'rgb(240, 240, 240)' && style.scheme.includes('dark'));
    check('why box: placeholder and selection are readable on the dark field', style.placeholder === 'rgb(138, 138, 138)' && style.selColor === 'rgb(255, 255, 255)', `${style.placeholder} / ${style.selBg} on ${style.selColor}`);
    await why.fill('');
    await shot('phase-13_correct.png');
    await saveShowcase(game, 'copilot-review', '02-correct-with-why', { locator: dialog, description: 'Correcting a suggestion: the command to send instead, the required why with its counter, and Send correction.' });
    await why.fill('Check the exits before walking blind.');

    // 3. the gate: typing in the game blocks Approve, and nothing is sent or recorded
    await input.click();
    await input.type('x', { delay: 20 });
    await card('look').getByRole('button', { name: 'Approve' }).click();
    await card('look').getByText(/you typed a moment ago/).waitFor({ state: 'visible', timeout: 3000 });
    check('Approve right after typing is refused, with the reason on the card', true);
    check('the refused command was not sent', !(await sentNow()).includes('look'));
    check('the refused answer was not recorded', posted.length === 0);
    check('the card stays so it can be approved again', await card('look').isVisible());
    await shot('phase-13_refused.png');
    await input.fill('');

    // 4. approve once the line is quiet: the command reaches the game, once, and the answer is recorded
    await game.waitForTimeout(2300);
    await card('look').getByRole('button', { name: 'Approve' }).click();
    await card('look').waitFor({ state: 'detached', timeout: 5000 });
    const sent = await sentNow();
    check('Approve sent the command to the game exactly once', sent.filter((c) => c === 'look').length === 1, JSON.stringify(sent));
    check('Approve recorded approved with the command', posted.length === 1 && posted[0].outcome === 'approved' && posted[0].command === 'look' && posted[0].suggestionId === 's1', JSON.stringify(posted[0]));
    await game.waitForTimeout(1500);
    // the client echoes what it sends to the game on a "> " line; the window's own text has no such line
    check('the command reached the game connection (the terminal echoes "> look")', /^> look$/m.test((await game.locator('body').innerText()) ?? ''));
    check('the answer is in the session log', ((await dialog.getByLabel('Session log').textContent()) ?? '').includes('Approved look'));

    // 5. correct: the owner's command is sent and the why is recorded
    await send.click();
    await card('north').waitFor({ state: 'detached', timeout: 5000 });
    check('Correct sent the corrected command', (await sentNow()).includes('exits'));
    const corrected = posted.find((d) => d.outcome === 'corrected');
    check('Correct recorded corrected with the command and the why', !!corrected && corrected.command === 'exits' && corrected.why === 'Check the exits before walking blind.', JSON.stringify(corrected));
    await game.waitForTimeout(3300);
    check('the open-tickets count follows the server', ((await dialog.textContent()) ?? '').includes('Open tickets: 1'));

    // 6. reject: nothing is sent; a why is optional
    await card('kill rat').getByRole('button', { name: 'Reject' }).click();
    await card('kill rat').getByLabel('Why (optional)').fill('Not while untrained.');
    await card('kill rat').getByRole('button', { name: 'Reject' }).click();
    await card('kill rat').waitFor({ state: 'detached', timeout: 5000 });
    const rejected = posted.find((d) => d.outcome === 'rejected');
    check('Reject recorded rejected with the why and no command', !!rejected && rejected.why === 'Not while untrained.' && !('command' in rejected), JSON.stringify(rejected));
    check('Reject sent nothing to the game', !(await sentNow()).includes('kill rat'));
    check('the empty state shows when nothing is left', await dialog.getByText('No suggestions yet.').isVisible());

    // 7. a long list: the body scrolls, the scrollbar is the dark one
    pending = [...extras()];
    await game.waitForTimeout(3300);
    const body = dialog.locator('[class*="body"]').first();
    const scroll = await body.evaluate((el) => ({ over: el.scrollHeight > el.clientHeight, sb: getComputedStyle(el).scrollbarColor }));
    check('a long list overflows into a scrolling body with the dark scrollbar colours', scroll.over && scroll.sb.includes('58, 58, 58'), JSON.stringify(scroll));
    await body.hover();
    await game.mouse.wheel(0, 120); // scrolling shows the thumb (the browser draws overlay scrollbars only while they are in use)
    await game.waitForTimeout(150);
    await shot('phase-13_long-list.png');
    await game.mouse.wheel(0, -400);

    // keyboard: a visible focus ring on the buttons
    await card('scan').getByRole('button', { name: 'Approve' }).focus();
    await game.keyboard.press('Shift+Tab');
    await game.keyboard.press('Tab');
    const ring = await card('scan').getByRole('button', { name: 'Approve' }).evaluate((el) => getComputedStyle(el).outlineStyle);
    check('a button reached by keyboard shows a focus ring', ring !== 'none', ring);

    // 8. offline: the last list stays, is marked, and cannot be answered
    offline = true;
    await dialog.getByRole('alert').first().waitFor({ state: 'visible', timeout: 8000 });
    check('the last list stays while offline', await card('scan').isVisible());
    check('the buttons are disabled while offline', await card('scan').getByRole('button', { name: 'Approve' }).isDisabled());
    check('the notice says answers are paused', ((await dialog.textContent()) ?? '').includes('Answers are paused'));
    await shot('phase-13_offline.png');
    offline = false;
    await game.waitForTimeout(3500);
    check('answers resume when the server is back', await card('scan').getByRole('button', { name: 'Approve' }).isEnabled());
  },
  { contextOptions: { viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true } },
);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
