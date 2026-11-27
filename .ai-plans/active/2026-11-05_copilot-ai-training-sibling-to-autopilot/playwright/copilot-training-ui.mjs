// Phase 34 UI check: Claude training in the Copilot window, against the dev stack's game client. The Copilot server's answers are given by this
// script (page.route) so the owner's real ledger gets nothing and the connection can be shown as the Simulacrum's; the game client is NOT
// connected to any game server. Screenshots of the finished state go through saveShowcase.
//   node copilot-training-ui.mjs <incremental output folder> [<showcase folder to copy into>]
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const SHOW = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
if (SHOW) fs.mkdirSync(SHOW, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const CORS = {
  'access-control-allow-origin': 'https://game-client.shatteredarchive.dev',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
};
const json = (body, status = 200) => ({ status, headers: CORS, body: JSON.stringify(body) });

let training = { enabled: false, world: 'sandbox', canEnable: true };
const posts = [];
const state = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 2, inFight: false, learning: true, room: { name: 'Market Square', sector: 'city', exits: ['N', 'E'] } };

await withPage(
  'https://game-client.shatteredarchive.dev/',
  async (page) => {
    await page.route('https://copilot.shatteredarchive.dev/**', async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (p === '/training' && req.method() === 'POST') {
        const body = JSON.parse(req.postData() ?? '{}');
        posts.push(body);
        training = { ...training, enabled: body.enabled };
        return route.fulfill(json(training));
      }
      if (p === '/training') return route.fulfill(json(training));
      if (p === '/state') return route.fulfill(json(state));
      if (p === '/control') return route.fulfill(json({ enabled: true }));
      if (p === '/suggestions') return route.fulfill(json({ suggestions: [] }));
      if (p === '/tickets') return route.fulfill(json({ tickets: [] }));
      if (p === '/stats/buckets') return route.fulfill(json({ buckets: {} }));
      return route.fulfill(json({ error: 'not stubbed' }, 404));
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('https://game-client.shatteredarchive.dev/');
    await page.waitForLoadState('networkidle');

    await page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first().click();
    await page.getByText(/^Copilot…/).first().click();
    const dialog = page.getByRole('dialog', { name: 'Copilot' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('switch', { name: 'Copilot' }).click(); // Copilot starts off
    await page.waitForFunction(() => /Online/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
    check('no banner while training is off', (await dialog.getByLabel('Claude training is on').count()) === 0);

    await dialog.getByRole('button', { name: 'Settings' }).click();
    const toggle = dialog.getByLabel('Claude training');
    await toggle.waitFor({ state: 'visible' });
    check('the switch is offered while the connection is the Simulacrum\'s', await toggle.isVisible());
    check('it is off and enabled', !(await toggle.isChecked()) && (await toggle.isEnabled()));
    await page.mouse.move(5, 5);
    await page.screenshot({ path: path.join(OUT, 'phase-34_01-settings-switch-off.png') });

    await toggle.click();
    const banner = dialog.getByLabel('Claude training is on');
    await banner.waitFor({ state: 'visible', timeout: 10000 });
    check('turning it on posts exactly { enabled: true }', JSON.stringify(posts) === JSON.stringify([{ enabled: true }]), JSON.stringify(posts));
    check('the banner says Claude is training Copilot', /Claude is training Copilot/.test((await banner.textContent()) ?? ''));
    await dialog.getByRole('button', { name: 'Suggestions' }).click();
    check('the banner stays on the other tab', await banner.isVisible());
    await page.mouse.move(5, 5);
    if (SHOW) {
      const shot = await saveShowcase(page, 'copilot-claude-training', '01-banner-while-training', { description: 'The Copilot window while Claude is training Copilot on the Simulacrum: a banner is always visible, and the switch is in the settings.' });
      const file = typeof shot === 'string' ? shot : shot?.path;
      if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(SHOW, 'showcase_07_claude-training-banner.png'));
    }
    await page.screenshot({ path: path.join(OUT, 'phase-34_02-banner-on.png') });

    // the connection moves to the production game: the server turns it off and the switch is gone
    training = { enabled: false, world: 'dsl', canEnable: false, refusal: 'not-simulacrum' };
    await banner.waitFor({ state: 'detached', timeout: 10000 });
    check('the banner goes when the server says training is off', (await dialog.getByLabel('Claude training is on').count()) === 0);
    await dialog.getByRole('button', { name: 'Settings' }).click();
    check('no switch against the production game', (await dialog.getByLabel('Claude training').count()) === 0);
    await page.mouse.move(5, 5);
    await page.screenshot({ path: path.join(OUT, 'phase-34_03-production-no-switch.png') });
  },
  { headless: true },
);
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? `\nALL ${results.length} CHECKS PASSED` : `\n${failed} CHECK(S) FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
