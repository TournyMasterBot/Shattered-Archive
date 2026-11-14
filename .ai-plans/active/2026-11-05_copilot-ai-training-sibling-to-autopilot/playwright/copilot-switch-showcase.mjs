// Showcase shots of the Copilot switch (Phases 24a and 24b), through the Shattered-AI showcase helper. Dev stack only; leaves Copilot OFF.
//   node copilot-switch-showcase.mjs
import { withPage } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs';
import { saveShowcase } from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs';

const FEATURE = 'copilot-switch';
const gameMenu = (page) => page.locator('[class*="menuItem"]').filter({ hasText: /^Game/ }).first();

await withPage(
  'https://game-client.shatteredarchive.dev/',
  async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.removeItem('copilot.enabled.v1'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    await gameMenu(page).click();
    await saveShowcase(page, FEATURE, '01-menu-off', { description: 'The Game menu says Copilot… (off): Copilot starts off in every browser' });
    await page.getByText('Copilot…', { exact: false }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Copilot' });
    await dialog.waitFor({ state: 'visible' });
    await saveShowcase(page, FEATURE, '02-window-off', { description: 'The Copilot window while off: nothing is requested or sent; the switch in the header turns it on', locator: dialog });

    await dialog.getByRole('switch', { name: 'Copilot' }).click();
    await page.waitForFunction(() => /Online|Offline/.test(document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
    await saveShowcase(page, FEATURE, '03-window-on', { description: 'The same window with the switch on: mode, server status, suggestions; the server now reads the game logs', locator: dialog });

    await dialog.getByRole('switch', { name: 'Copilot' }).click(); // leave it off
    await page.waitForTimeout(800);
    await page.evaluate(() => localStorage.removeItem('copilot.enabled.v1'));
  },
  { headless: true },
);
console.log('done');
